#!/usr/bin/env python3
"""Test script to verify Gemini connection works"""

import asyncio
import os
from google import genai

# Configuration
CREDENTIALS_PATH = './credentials.json'
GOOGLE_CLOUD_PROJECT = "dochq-staging"
GOOGLE_CLOUD_LOCATION = "us-central1"
MODEL = "gemini-2.0-flash-live-preview-04-09"

# Check for credentials
if os.path.exists(CREDENTIALS_PATH):
    os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = CREDENTIALS_PATH
    print(f"✓ Credentials found at {CREDENTIALS_PATH}")
else:
    print(f"✗ Credentials not found at {CREDENTIALS_PATH}")
    exit(1)

async def test_connection():
    """Test basic connection to Gemini"""
    try:
        # Initialize client
        client = genai.Client(
            vertexai=True,
            project=GOOGLE_CLOUD_PROJECT,
            location=GOOGLE_CLOUD_LOCATION,
        )
        print("✓ Client initialized")
        
        # Test with simple config (audio only)
        CONFIG = {"response_modalities": ["AUDIO"]}
        
        # Connect to live session
        print("Connecting to Gemini...")
        async with client.aio.live.connect(model=MODEL, config=CONFIG) as session:
            print("✓ Connected to Gemini successfully!")
            
            # Send a test message
            await session.send(input="Hello, this is a test. Can you hear me?", end_of_turn=True)
            print("✓ Test message sent")
            
            # Wait for response
            turn = session.receive()
            response_count = 0
            async for response in turn:
                response_count += 1
                if hasattr(response, 'text') and response.text:
                    print(f"✓ Received text response: {response.text[:50]}...")
                if hasattr(response, 'data') and response.data:
                    print(f"✓ Received audio response ({len(response.data)} bytes)")
                if response_count >= 3:  # Limit responses for test
                    break
            
            print(f"✓ Received {response_count} responses")
            
    except Exception as e:
        print(f"✗ Error: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    print("Testing Gemini connection...")
    asyncio.run(test_connection())