from tqdm import tqdm
import asyncio
import aiohttp
import os
import pandas as pd
from oauth2client.service_account import ServiceAccountCredentials
import json
import sys

# Constants
SCOPES = ["https://www.googleapis.com/auth/indexing"]
ENDPOINT = "https://indexing.googleapis.com/v3/urlNotifications:publish"
URLS_PER_ACCOUNT = 200

from aiohttp.client_exceptions import ServerDisconnectedError

async def send_url(session, http, url):
    """
    Send single URL to Google Indexing API with retry mechanism
    """
    content = {
        'url': url.strip(),
        'type': "URL_UPDATED"
    }
    
    # Retry up to 3 times
    for attempt in range(3):
        try:
            async with session.post(
                ENDPOINT, 
                json=content, 
                headers={"Authorization": f"Bearer {http}"}, 
                ssl=False
            ) as response:
                response_text = await response.text()
                return response_text
                
        except ServerDisconnectedError:
            if attempt < 2:  # Don't wait after last attempt
                await asyncio.sleep(2)  # Wait for 2 seconds before retrying
            continue
        except Exception as e:
            print(f"❌ Unexpected error for {url}: {str(e)}")
            break
    
    # Return error message if all retries fail
    return '{"error": {"code": 500, "message": "Server Disconnected after multiple retries"}}'

async def indexURL(http, urls):
    """
    Process multiple URLs asynchronously for a single account
    """
    successful_urls = 0
    error_429_count = 0
    other_errors_count = 0
    tasks = []

    async with aiohttp.ClientSession() as session:
        # Using tqdm for progress bar
        print(f"🔧 Processing {len(urls)} URLs...")
        for url in tqdm(urls, desc="URLs", unit="url"):
            tasks.append(send_url(session, http, url))

        # Wait for all requests to complete
        results = await asyncio.gather(*tasks)

        # Process results
        for result in results:
            try:
                data = json.loads(result)
                if "error" in data:
                    if data["error"]["code"] == 429:
                        error_429_count += 1
                    else:
                        other_errors_count += 1
                else:
                    successful_urls += 1
            except json.JSONDecodeError:
                other_errors_count += 1

    # Print summary for this account
    print(f"\n📊 Account Summary:")
    print(f"✅ Successful URLs: {successful_urls}")
    print(f"🚫 429 Errors (Rate Limit): {error_429_count}")
    print(f"❌ Other Errors: {other_errors_count}")
    
    return successful_urls, error_429_count, other_errors_count

def setup_http_client(json_key_file):
    """
    Set up Google API client with service account credentials
    """
    try:
        credentials = ServiceAccountCredentials.from_json_keyfile_name(json_key_file, scopes=SCOPES)
        token = credentials.get_access_token().access_token
        print(f"🔑 Authentication successful for {json_key_file}")
        return token
    except Exception as e:
        print(f"❌ Authentication failed for {json_key_file}: {str(e)}")
        raise

def main(num_accounts):
    """
    Main function to process URLs across multiple accounts
    """
    # Check if CSV file exists
    if not os.path.exists("data.csv"):
        print("❌ Error: data.csv file not found!")
        return

    # Read all URLs from CSV
    try:
        all_urls = pd.read_csv("data.csv")["URL"].tolist()
        print(f"📖 Loaded {len(all_urls)} URLs from data.csv")
    except Exception as e:
        print(f"❌ Error reading data.csv: {e}")
        return

    total_successful = 0
    total_429_errors = 0
    total_other_errors = 0

    # Process URLs for each account
    for i in range(num_accounts):
        account_num = i + 1
        print(f"\n{'='*50}")
        print(f"👤 Processing URLs for Account {account_num}...")
        print(f"{'='*50}")
        
        json_key_file = f"account{account_num}.json"

        # Check if account JSON file exists
        if not os.path.exists(json_key_file):
            print(f"❌ Error: {json_key_file} not found! Skipping account...")
            continue

        # Calculate URLs for this account
        start_index = i * URLS_PER_ACCOUNT
        end_index = start_index + URLS_PER_ACCOUNT
        urls_for_account = all_urls[start_index:end_index]
        
        if not urls_for_account:
            print("ℹ️  No more URLs to process for this account")
            break
            
        print(f"🔗 URLs to process: {len(urls_for_account)}")

        try:
            # Set up HTTP client and process URLs
            http = setup_http_client(json_key_file)
            successful, error_429, other_errors = asyncio.run(indexURL(http, urls_for_account))
            
            # Update totals
            total_successful += successful
            total_429_errors += error_429
            total_other_errors += other_errors
            
            # Add delay between accounts to avoid rate limiting
            if i < num_accounts - 1:  # Don't delay after last account
                print("⏳ Waiting 5 seconds before next account...")
                import time
                time.sleep(5)
                
        except Exception as e:
            print(f"❌ Error processing Account {account_num}: {str(e)}")
            continue

    # Print final summary
    print(f"\n{'='*60}")
    print(f"🎯 FINAL SUMMARY")
    print(f"{'='*60}")
    print(f"📊 Total URLs Processed: {len(all_urls)}")
    print(f"✅ Total Successful: {total_successful}")
    print(f"🚫 Total 429 Errors: {total_429_errors}")
    print(f"❌ Total Other Errors: {total_other_errors}")
    
    if total_successful > 0:
        success_rate = (total_successful / len(all_urls)) * 100
        print(f"📈 Success Rate: {success_rate:.2f}%")
    
    print(f"{'='*60}")

# Call the main function
if __name__ == "__main__":
    try:
        # Get number of accounts from command line argument
        num_accounts = int(sys.argv[1]) if len(sys.argv) > 1 else 1
        print(f"🚀 Starting indexing with {num_accounts} account(s)")
        main(num_accounts)
        
    except KeyboardInterrupt:
        print("\n\n⚠️  Script interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Script failed with error: {str(e)}")
        sys.exit(1)