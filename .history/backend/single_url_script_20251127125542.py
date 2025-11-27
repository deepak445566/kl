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

from aiohttp.client_exceptions import ServerDisconnectedError

async def send_single_url(session, http, url):
    """
    Send single URL to Google Indexing API with retry mechanism
    """
    content = {
        'url': url.strip(),
        'type': "URL_UPDATED"
    }
    
    print(f"🔍 Attempting to index: {url}")
    
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
                data = json.loads(response_text)
                
                if "error" in data:
                    error_msg = data["error"]["message"]
                    print(f"❌ Attempt {attempt + 1} failed: {error_msg}")
                    
                    # If it's a 429 error (rate limit), wait longer
                    if data["error"]["code"] == 429:
                        wait_time = (attempt + 1) * 5  # 5, 10, 15 seconds
                        print(f"⏳ Rate limited. Waiting {wait_time} seconds...")
                        await asyncio.sleep(wait_time)
                    else:
                        # For other errors, wait 2 seconds
                        if attempt < 2:
                            await asyncio.sleep(2)
                else:
                    # Success!
                    print(f"✅ SUCCESS: {url} indexed successfully")
                    return True
                    
        except ServerDisconnectedError:
            print(f"🔌 Server disconnected on attempt {attempt + 1}")
            if attempt < 2:
                wait_time = (attempt + 1) * 2  # 2, 4 seconds
                print(f"⏳ Retrying in {wait_time} seconds...")
                await asyncio.sleep(wait_time)
            continue
            
        except json.JSONDecodeError:
            print(f"📄 JSON decode error on attempt {attempt + 1}")
            if attempt < 2:
                await asyncio.sleep(2)
            continue
            
        except Exception as e:
            print(f"⚠️ Unexpected error on attempt {attempt + 1}: {str(e)}")
            if attempt < 2:
                await asyncio.sleep(2)
            continue
    
    # If we get here, all attempts failed
    print(f"❌ FAILED: {url} could not be indexed after multiple attempts")
    return False

async def index_single_url(http, url):
    """
    Process single URL asynchronously
    """
    async with aiohttp.ClientSession() as session:
        success = await send_single_url(session, http, url)
        return success

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
        print(f"❌ Authentication failed: {str(e)}")
        raise

def main():
    """
    Main function to process single URL
    """
    # Check if single_url.csv exists
    if not os.path.exists("single_url.csv"):
        print("❌ Error: single_url.csv file not found!")
        return False

    # Read single URL from CSV
    try:
        df = pd.read_csv("single_url.csv")
        url = df["URL"].iloc[0]  # Get first URL
        print(f"🔗 Processing single URL: {url}")
    except Exception as e:
        print(f"❌ Error reading single_url.csv: {e}")
        return False

    # Use account1.json
    json_key_file = "account1.json"

    # Check if account JSON file exists
    if not os.path.exists(json_key_file):
        print(f"❌ Error: {json_key_file} not found!")
        return False

    try:
        # Set up HTTP client and process URL
        http = setup_http_client(json_key_file)
        success = asyncio.run(index_single_url(http, url))
        
        if success:
            print("🎉 Single URL indexing completed successfully!")
        else:
            print("💥 Single URL indexing failed!")
            
        return success
        
    except Exception as e:
        print(f"❌ Error during indexing: {e}")
        return False

# Call the main function
if __name__ == "__main__":
    try:
        print("🚀 Starting single URL indexing...")
        success = main()
        
        # Exit with appropriate code
        if success:
            print("✨ Script completed successfully")
            sys.exit(0)
        else:
            print("💢 Script completed with errors")
            sys.exit(1)
            
    except KeyboardInterrupt:
        print("\n\n⚠️  Script interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Script failed with error: {str(e)}")
        sys.exit(1)