import asyncio
import aiohttp
import os
import pandas as pd
from oauth2client.service_account import ServiceAccountCredentials
import json
import sys
import traceback

# Constants
SCOPES = ["https://www.googleapis.com/auth/indexing"]
ENDPOINT = "https://indexing.googleapis.com/v3/urlNotifications:publish"

print("🚀 Starting single URL indexing script...")

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
            print(f"📡 Attempt {attempt + 1} for {url}")
            async with session.post(
                ENDPOINT, 
                json=content, 
                headers={"Authorization": f"Bearer {http}"}, 
                ssl=False,
                timeout=aiohttp.ClientTimeout(total=30)
            ) as response:
                response_text = await response.text()
                data = json.loads(response_text)
                
                print(f"📊 Response status: {response.status}")
                print(f"📄 Response data: {data}")
                
                if "error" in data:
                    error_msg = data["error"]["message"]
                    error_code = data["error"].get("code", "Unknown")
                    print(f"❌ Attempt {attempt + 1} failed: {error_code} - {error_msg}")
                    
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
                    return True, data
                    
        except ServerDisconnectedError:
            print(f"🔌 Server disconnected on attempt {attempt + 1}")
            if attempt < 2:
                wait_time = (attempt + 1) * 2  # 2, 4 seconds
                print(f"⏳ Retrying in {wait_time} seconds...")
                await asyncio.sleep(wait_time)
            continue
            
        except json.JSONDecodeError as e:
            print(f"📄 JSON decode error on attempt {attempt + 1}: {e}")
            if attempt < 2:
                await asyncio.sleep(2)
            continue
            
        except asyncio.TimeoutError:
            print(f"⏰ Timeout on attempt {attempt + 1}")
            if attempt < 2:
                await asyncio.sleep(2)
            continue
            
        except Exception as e:
            print(f"⚠️ Unexpected error on attempt {attempt + 1}: {str(e)}")
            print(f"🔍 Error details: {traceback.format_exc()}")
            if attempt < 2:
                await asyncio.sleep(2)
            continue
    
    # If we get here, all attempts failed
    print(f"❌ FAILED: {url} could not be indexed after multiple attempts")
    return False, None

async def index_single_url(http, url):
    """
    Process single URL asynchronously
    """
    print(f"🔧 Setting up HTTP client for URL: {url}")
    async with aiohttp.ClientSession() as session:
        success, response_data = await send_single_url(session, http, url)
        return success, response_data

def setup_http_client(json_key_file):
    """
    Set up Google API client with service account credentials
    """
    print(f"🔑 Setting up HTTP client with: {json_key_file}")
    
    # Check if file exists
    if not os.path.exists(json_key_file):
        print(f"❌ Account file not found: {json_key_file}")
        raise FileNotFoundError(f"Account file {json_key_file} not found")
    
    print(f"✅ Account file found: {json_key_file}")
    
    try:
        # Read and validate JSON file
        with open(json_key_file, 'r') as f:
            json_data = json.load(f)
            print(f"✅ JSON file parsed successfully")
            print(f"📧 Client email: {json_data.get('client_email', 'Not found')}")
            print(f"🏢 Project ID: {json_data.get('project_id', 'Not found')}")
        
        credentials = ServiceAccountCredentials.from_json_keyfile_name(json_key_file, scopes=SCOPES)
        token = credentials.get_access_token().access_token
        print(f"✅ Authentication successful")
        print(f"🔐 Token obtained (first 20 chars): {token[:20]}...")
        return token
    except Exception as e:
        print(f"❌ Authentication failed: {str(e)}")
        print(f"🔍 Error details: {traceback.format_exc()}")
        raise

def main():
    """
    Main function to process single URL
    """
    print("🔍 Checking for single_url.csv...")
    
    # Check if single_url.csv exists
    if not os.path.exists("single_url.csv"):
        print("❌ Error: single_url.csv file not found!")
        print("📁 Current directory files:", os.listdir('.'))
        return False

    # Read single URL from CSV
    try:
        df = pd.read_csv("single_url.csv")
        print(f"✅ CSV file read successfully")
        print(f"📊 CSV columns: {df.columns.tolist()}")
        print(f"📊 CSV shape: {df.shape}")
        
        url = df["URL"].iloc[0]  # Get first URL
        print(f"🔗 Processing single URL: {url}")
    except Exception as e:
        print(f"❌ Error reading single_url.csv: {e}")
        print(f"🔍 Error details: {traceback.format_exc()}")
        return False

    # Use account1.json
    json_key_file = "account1.json"
    print(f"🔍 Checking for account file: {json_key_file}")

    # Check if account JSON file exists
    if not os.path.exists(json_key_file):
        print(f"❌ Error: {json_key_file} not found!")
        print("📁 Current directory files:", os.listdir('.'))
        return False

    print(f"✅ Account file found: {json_key_file}")

    try:
        # Set up HTTP client and process URL
        print("🔄 Setting up HTTP client...")
        http = setup_http_client(json_key_file)
        print("🔄 Starting URL indexing...")
        success, response_data = asyncio.run(index_single_url(http, url))
        
        if success:
            print("🎉 Single URL indexing completed successfully!")
            print(f"📄 Response: {response_data}")
        else:
            print("💥 Single URL indexing failed!")
            
        return success
        
    except Exception as e:
        print(f"❌ Error during indexing: {e}")
        print(f"🔍 Error details: {traceback.format_exc()}")
        return False

# Call the main function
if __name__ == "__main__":
    try:
        print("=" * 50)
        print("🚀 Starting single URL indexing...")
        print("=" * 50)
        
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
        print(f"🔍 Error details: {traceback.format_exc()}")
        sys.exit(1)