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

from aiohttp.client_exceptions import ServerDisconnectedError

async def send_single_url(session, http, url):
    content = {
        'url': url.strip(),
        'type': "URL_UPDATED"
    }
    for _ in range(3):  # Retry up to 3 times
        try:
            async with session.post(ENDPOINT, json=content, headers={"Authorization": f"Bearer {http}"}, ssl=False) as response:
                response_text = await response.text()
                data = json.loads(response_text)
                
                if "error" in data:
                    print(f"❌ Error for {url}: {data['error']['message']}")
                    return False
                else:
                    print(f"✅ SUCCESS: {url} indexed successfully")
                    return True
                    
        except ServerDisconnectedError:
            await asyncio.sleep(2)  # Wait for 2 seconds before retrying
            continue
        except Exception as e:
            print(f"❌ Exception for {url}: {str(e)}")
            return False
    
    print(f"❌ Failed after multiple retries: {url}")
    return False

async def index_single_url(http, url):
    async with aiohttp.ClientSession() as session:
        success = await send_single_url(session, http, url)
        return success

def setup_http_client(json_key_file):
    credentials = ServiceAccountCredentials.from_json_keyfile_name(json_key_file, scopes=SCOPES)
    token = credentials.get_access_token().access_token
    return token

def main():
    # Check if single_url.csv exists
    if not os.path.exists("single_url.csv"):
        print("Error: single_url.csv file not found!")
        return False

    # Read single URL from CSV
    try:
        df = pd.read_csv("single_url.csv")
        url = df["URL"].iloc[0]  # Get first URL
        print(f"🔗 Processing single URL: {url}")
    except Exception as e:
        print(f"Error reading single_url.csv: {e}")
        return False

    # Use account1.json
    json_key_file = "account1.json"

    # Check if account JSON file exists
    if not os.path.exists(json_key_file):
        print(f"Error: {json_key_file} not found!")
        return False

    try:
        http = setup_http_client(json_key_file)
        success = asyncio.run(index_single_url(http, url))
        return success
    except Exception as e:
        print(f"Error during indexing: {e}")
        return False

# Call the main function
if __name__ == "__main__":
    try:
        success = main()
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\nScript interrupted by user")
        sys.exit(1)