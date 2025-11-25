import sys
import asyncio
import aiohttp
import pandas as pd
from oauth2client.service_account import ServiceAccountCredentials
import json
from tqdm import tqdm
import os
import tempfile

# Constants
SCOPES = ["https://www.googleapis.com/auth/indexing"]
ENDPOINT = "https://indexing.googleapis.com/v3/urlNotifications:publish"

from aiohttp.client_exceptions import ServerDisconnectedError

async def send_url(session, http, url):
    content = {
        'url': url.strip(),
        'type': "URL_UPDATED"
    }
    for _ in range(3):  # Retry up to 3 times
        try:
            async with session.post(ENDPOINT, json=content, headers={"Authorization": f"Bearer {http}"}, ssl=False) as response:
                return await response.text()
        except ServerDisconnectedError:
            await asyncio.sleep(2)
            continue
    return '{"error": {"code": 500, "message": "Server Disconnected"}}'

async def indexURL(http, urls):
    successful_urls = 0
    error_429_count = 0
    other_errors_count = 0
    
    print(f"Processing {len(urls)} URLs...")

    async with aiohttp.ClientSession() as session:
        tasks = []
        for url in tqdm(urls, desc="Indexing URLs", unit="url"):
            tasks.append(send_url(session, http, url))

        results = await asyncio.gather(*tasks)

        for result in results:
            data = json.loads(result)
            if "error" in data:
                if data["error"]["code"] == 429:
                    error_429_count += 1
                else:
                    other_errors_count += 1
                    print(f"Error for URL: {data['error']}")
            else:
                successful_urls += 1

    print(f"✅ Completed: {successful_urls} successful, ⚠ {error_429_count} rate limited, ❌ {other_errors_count} failed")

def setup_http_client(account_path):
    credentials = ServiceAccountCredentials.from_json_keyfile_name(account_path, scopes=SCOPES)
    token = credentials.get_access_token().access_token
    return token

def get_account_path():
    """Get service account file path from command line or environment"""
    # Command line argument (from server.js)
    if len(sys.argv) >= 3:
        return sys.argv[2]
    
    # Environment variable (Render)
    env_json = os.getenv('GOOGLE_SERVICE_ACCOUNT_JSON')
    if env_json:
        try:
            # Create temporary file from environment variable
            temp_file = tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False)
            json.dump(json.loads(env_json), temp_file)
            temp_file.close()
            return temp_file.name
        except Exception as e:
            print(f"Error creating temp account file: {e}")
    
    # Local file (development)
    if os.path.exists("account1.json"):
        return "account1.json"
    
    return None

def main():
    if len(sys.argv) < 2:
        print("Error: No CSV file provided")
        return

    csv_file = sys.argv[1]
    
    if not os.path.exists(csv_file):
        print(f"Error: {csv_file} not found!")
        return

    # Get account file path
    account_file = get_account_path()
    if not account_file:
        print("Error: No Google Service Account configuration found!")
        print("Please set GOOGLE_SERVICE_ACCOUNT_JSON environment variable")
        return

    print(f"📁 Using account file: {account_file}")

    # Read URLs from CSV
    try:
        df = pd.read_csv(csv_file)
        all_urls = df["URL"].tolist()
        print(f"📊 Loaded {len(all_urls)} URLs from CSV")
    except Exception as e:
        print(f"Error reading CSV: {e}")
        return

    # Process URLs
    print("🚀 Starting indexing...")
    
    try:
        http = setup_http_client(account_file)
        asyncio.run(indexURL(http, all_urls))
        print("🎉 Indexing process completed!")
    except Exception as e:
        print(f"❌ Indexing failed: {e}")
    finally:
        # Cleanup temporary account file
        if account_file.startswith('/tmp') or 'temp' in account_file:
            try:
                os.unlink(account_file)
                print("🧹 Temporary account file cleaned up")
            except:
                pass

if __name__ == "__main__":
    main()