import asyncio
import base64
import io
import os
import cv2
import PIL.Image
import numpy as np
import logging
from typing import AsyncGenerator, Dict, Any
from google import genai
from google.genai.types import Content, Part

logger = logging.getLogger(__name__)

class GeminiVideoChat:
    def __init__(self):
        # Configuration
        CREDENTIALS_PATH = './credentials.json'
        self.GOOGLE_CLOUD_PROJECT = "dochq-staging"
        self.GOOGLE_CLOUD_LOCATION = "us-central1"
        
        # Check for credentials
        if os.path.exists(CREDENTIALS_PATH):
            os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = CREDENTIALS_PATH
            logger.info("Credentials loaded successfully")
        else:
            raise RuntimeError(f"Credentials file not found at {CREDENTIALS_PATH}")
        
        # Initialize client
        try:
            self.client = genai.Client(
                vertexai=True,
                project=self.GOOGLE_CLOUD_PROJECT,
                location=self.GOOGLE_CLOUD_LOCATION,
            )
            logger.info("Gemini client initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize Gemini client: {e}")
            raise
        
        # Configuration
        self.MODEL = "gemini-2.0-flash-live-preview-04-09"
        self.CONFIG = {
            "response_modalities": ["AUDIO", "TEXT"],
            "speech_config": {
                "voice_config": {
                    "prebuilt_voice_config": {
                        "voice_name": "Puck"  # You can change this to other voices
                    }
                }
            }
        }
        
        # Session management
        self.session = None
        self.response_queue = asyncio.Queue()
        self.is_active = False
        self._response_task = None
    
    async def start_session(self):
        """Start the Gemini session"""
        try:
            self.session = await self.client.aio.live.connect(
                model=self.MODEL, 
                config=self.CONFIG
            ).__aenter__()
            
            self.is_active = True
            
            # Start response listener
            self._response_task = asyncio.create_task(self._listen_responses())
            
            logger.info("Gemini session started successfully")
            
            # Send initial greeting
            await self.session.send(
                input="Hello! I'm ready to have a video conversation with you. I can see your video feed and hear your audio. How can I help you today?",
                end_of_turn=True
            )
            
        except Exception as e:
            logger.error(f"Failed to start Gemini session: {e}")
            raise
    
    async def _listen_responses(self):
        """Listen for responses from Gemini"""
        try:
            while self.is_active and self.session:
                try:
                    turn = self.session.receive()
                    async for response in turn:
                        response_data = {}
                        
                        # Handle text responses
                        if hasattr(response, 'text') and response.text:
                            response_data['text'] = response.text
                            logger.info(f"Received text response: {response.text[:100]}...")
                        
                        # Handle audio responses
                        if hasattr(response, 'data') and response.data:
                            response_data['audio'] = base64.b64encode(response.data).decode()
                            logger.info("Received audio response")
                        
                        # Handle transcriptions
                        if hasattr(response, 'output_transcription') and response.output_transcription:
                            response_data['transcription'] = response.output_transcription
                            logger.info(f"AI speech transcription: {response.output_transcription}")
                        
                        # Handle input transcriptions (what the user said)
                        if hasattr(response, 'input_transcription') and response.input_transcription:
                            response_data['user_transcription'] = response.input_transcription
                            logger.info(f"User speech transcription: {response.input_transcription}")
                        
                        # Send response if we have data
                        if response_data:
                            await self.response_queue.put(response_data)
                        
                except asyncio.CancelledError:
                    logger.info("Response listener cancelled")
                    break
                except Exception as e:
                    logger.error(f"Error in response listener: {e}")
                    # Continue listening unless it's a critical error
                    if "session" in str(e).lower() or "connection" in str(e).lower():
                        break
                    await asyncio.sleep(1)  # Brief pause before retrying
                        
        except Exception as e:
            logger.error(f"Critical error in response listener: {e}")
        finally:
            logger.info("Response listener stopped")
    
    async def send_video_frame(self, frame_data: bytes):
        """Send video frame to Gemini"""
        if not self.session or not self.is_active:
            logger.warning("Session not active, cannot send video frame")
            return
            
        try:
            # Convert frame data to PIL Image
            nparr = np.frombuffer(frame_data, np.uint8)
            frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            
            if frame is None:
                logger.warning("Failed to decode video frame")
                return
            
            # Convert BGR to RGB
            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            
            # Resize and encode
            img = PIL.Image.fromarray(frame_rgb)
            img.thumbnail([1024, 1024])  # Resize to max 1024x1024
            
            # Convert to JPEG
            image_io = io.BytesIO()
            img.save(image_io, format="JPEG", quality=85)
            image_io.seek(0)
            
            # Prepare for sending
            image_bytes = image_io.read()
            frame_data_dict = {
                "mime_type": "image/jpeg",
                "data": base64.b64encode(image_bytes).decode()
            }
            
            # Send to Gemini
            await self.session.send(input=frame_data_dict)
            logger.debug("Video frame sent successfully")
            
        except Exception as e:
            logger.error(f"Error sending video frame: {e}")
    
    async def send_audio_data(self, audio_data: bytes):
        """Send audio data to Gemini"""
        if not self.session or not self.is_active:
            logger.warning("Session not active, cannot send audio data")
            return
            
        try:
            # Prepare audio message
            audio_message = {
                "data": audio_data,
                "mime_type": "audio/pcm"
            }
            
            # Send to Gemini
            await self.session.send(input=audio_message)
            logger.debug("Audio data sent successfully")
            
        except Exception as e:
            logger.error(f"Error sending audio data: {e}")
    
    async def send_text(self, text: str):
        """Send text message to Gemini"""
        if not self.session or not self.is_active:
            logger.warning("Session not active, cannot send text")
            return
            
        try:
            await self.session.send(input=text, end_of_turn=True)
            logger.info(f"Text message sent: {text}")
            
        except Exception as e:
            logger.error(f"Error sending text message: {e}")
    
    async def get_responses(self) -> AsyncGenerator[Dict[str, Any], None]:
        """Generator for responses"""
        while self.is_active:
            try:
                # Wait for response with timeout
                response = await asyncio.wait_for(
                    self.response_queue.get(), 
                    timeout=30.0
                )
                yield response
                
            except asyncio.TimeoutError:
                # Send keepalive or continue waiting
                logger.debug("Response timeout, continuing to wait...")
                continue
                
            except Exception as e:
                logger.error(f"Error getting response: {e}")
                break
    
    async def cleanup(self):
        """Cleanup resources"""
        logger.info("Starting cleanup...")
        
        self.is_active = False
        
        # Cancel response task
        if self._response_task and not self._response_task.done():
            self._response_task.cancel()
            try:
                await self._response_task
            except asyncio.CancelledError:
                pass
        
        # Close session
        if self.session:
            try:
                await self.session.__aexit__(None, None, None)
                logger.info("Gemini session closed successfully")
            except Exception as e:
                logger.error(f"Error closing Gemini session: {e}")
            finally:
                self.session = None
        
        # Clear response queue
        while not self.response_queue.empty():
            try:
                self.response_queue.get_nowait()
            except asyncio.QueueEmpty:
                break
        
        logger.info("Cleanup completed")

# Test function to verify the client works
async def test_gemini_client():
    """Test function to verify Gemini client functionality"""
    client = GeminiVideoChat()
    
    try:
        await client.start_session()
        print("✅ Gemini client test successful!")
        
        # Test text message
        await client.send_text("Hello, this is a test message.")
        
        # Wait for a response
        async for response in client.get_responses():
            print(f"Response: {response}")
            break  # Just get one response for testing
        
    except Exception as e:
        print(f"❌ Gemini client test failed: {e}")
    finally:
        await client.cleanup()

if __name__ == "__main__":
    # Run test
    asyncio.run(test_gemini_client())