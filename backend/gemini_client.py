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
        # Configuration exactly matching your working code
        CREDENTIALS_PATH = './credentials.json'
        self.GOOGLE_CLOUD_PROJECT = "dochq-staging"
        self.GOOGLE_CLOUD_LOCATION = "us-central1"
        
        # Check for credentials
        if os.path.exists(CREDENTIALS_PATH):
            os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = CREDENTIALS_PATH
            logger.info("Credentials loaded successfully")
        else:
            raise RuntimeError(f"Credentials file not found at {CREDENTIALS_PATH}")
        
        # Initialize client exactly like working code
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
        
        # Configuration exactly matching your working code
        self.MODEL = "gemini-2.0-flash-live-preview-04-09"
        self.CONFIG = {
            "response_modalities": ["AUDIO"]  # Only AUDIO like working code
        }
        
        # Session management
        self.session = None
        self.response_queue = asyncio.Queue()
        self.out_queue = None
        self.is_active = False
        self._response_task = None
        self._send_task = None
    
    async def start_session(self):
        """Start the Gemini session"""
        try:
            # Use async context manager exactly like working code
            self._session_context = self.client.aio.live.connect(
                model=self.MODEL, 
                config=self.CONFIG
            )
            self.session = await self._session_context.__aenter__()
            
            self.is_active = True
            self.out_queue = asyncio.Queue(maxsize=5)  # Same as your working code
            
            # Start response listener
            self._response_task = asyncio.create_task(self._listen_responses())
            
            # Start sending task
            self._send_task = asyncio.create_task(self._send_realtime())
            
            logger.info("Gemini session started successfully")
            
        except Exception as e:
            logger.error(f"Failed to start Gemini session: {e}")
            raise
    
    async def _listen_responses(self):
        """Listen for responses from Gemini - matching your working code structure"""
        try:
            while self.is_active and self.session:
                try:
                    turn = self.session.receive()
                    async for response in turn:
                        if not self.is_active:  # Check if we're still active
                            break
                            
                        response_data = {}
                        
                        # Handle text responses
                        if hasattr(response, 'text') and response.text:
                            response_data['text'] = response.text
                            logger.info(f"Received text response: {response.text[:100]}...")
                        
                        # Handle audio responses - same as your working code
                        if hasattr(response, 'data') and response.data:
                            response_data['audio'] = base64.b64encode(response.data).decode()
                            logger.info("Received audio response")
                        
                        # Handle transcriptions - matching your working code
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
                    
                    # If we reach here, the turn ended normally
                    if not self.is_active:
                        break
                        
                except asyncio.CancelledError:
                    logger.info("Response listener cancelled")
                    break
                except Exception as e:
                    # Check if it's a disconnect error
                    if "disconnect message has been received" in str(e) or "ConnectionClosed" in str(e):
                        logger.info("Gemini session disconnected")
                        self.is_active = False
                        break
                    logger.error(f"Error in response listener: {e}")
                    await asyncio.sleep(1)  # Brief pause before retrying
                        
        except Exception as e:
            logger.error(f"Critical error in response listener: {e}")
        finally:
            self.is_active = False  # Ensure we're marked as inactive
            logger.info("Response listener stopped")
    
    async def _send_realtime(self):
        """Send realtime data to Gemini - matching your working code"""
        try:
            while self.is_active and self.session:
                try:
                    # Wait for new items in queue with timeout
                    msg = await asyncio.wait_for(self.out_queue.get(), timeout=1.0)
                    
                    # Check if still active before sending
                    if not self.is_active:
                        break
                    
                    # Send to Gemini using the same method as your working code
                    await self.session.send(input=msg)
                    logger.debug("Sent message to Gemini")
                    
                except asyncio.TimeoutError:
                    # Continue if no messages in queue
                    continue
                except asyncio.CancelledError:
                    logger.info("Send realtime cancelled")
                    break
                except Exception as e:
                    # Check if it's a disconnect error
                    if "disconnect message has been received" in str(e) or "ConnectionClosed" in str(e):
                        logger.info("Gemini session disconnected in send")
                        self.is_active = False
                        break
                    logger.error(f"Error in send realtime: {e}")
                    await asyncio.sleep(0.1)
                    
        except Exception as e:
            logger.error(f"Critical error in send realtime: {e}")
        finally:
            self.is_active = False  # Ensure we're marked as inactive
            logger.info("Send realtime stopped")
    
    async def send_video_frame(self, frame_data: bytes):
        """Send video frame to Gemini - matching your working code structure"""
        if not self.session or not self.is_active:
            logger.debug("Session not active, cannot send video frame")
            return
            
        try:
            # Frame data is already base64 JPEG from frontend
            # Decode it to get raw JPEG bytes
            jpeg_bytes = base64.b64decode(frame_data)
            
            # For compatibility with working code, process the image
            nparr = np.frombuffer(jpeg_bytes, np.uint8)
            frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            
            if frame is None:
                logger.warning("Failed to decode video frame")
                return
            
            # Convert BGR to RGB - same as your working code
            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            
            # Resize and encode - same as your working code
            img = PIL.Image.fromarray(frame_rgb)
            img.thumbnail([1024, 1024])  # Same size as your working code
            
            # Convert to JPEG - same format as your working code
            image_io = io.BytesIO()
            img.save(image_io, format="jpeg")
            image_io.seek(0)
            
            # Prepare for sending - exact same format as your working code
            image_bytes = image_io.read()
            frame_data_dict = {
                "mime_type": "image/jpeg",
                "data": base64.b64encode(image_bytes).decode()
            }
            
            # Put in queue instead of sending directly - matching your working code flow
            try:
                self.out_queue.put_nowait(frame_data_dict)
                logger.debug("Video frame queued successfully")
            except asyncio.QueueFull:
                logger.debug("Video frame queue full, skipping frame")
            
        except Exception as e:
            logger.error(f"Error sending video frame: {e}")
    
    async def send_audio_data(self, audio_data):
        """Send audio data to Gemini - matching your working code exactly"""
        if not self.session or not self.is_active:
            logger.debug("Session not active, cannot send audio data")
            return
            
        try:
            # Decode base64 audio data from frontend - PCM 16-bit data
            if isinstance(audio_data, str):
                audio_bytes = base64.b64decode(audio_data)
            else:
                audio_bytes = audio_data
            
            # Prepare audio message - exact same format as your working code
            audio_message = {
                "data": audio_bytes,  # Raw PCM bytes, not base64 encoded
                "mime_type": "audio/pcm"
            }
            
            # Put in queue instead of sending directly - matching your working code flow
            try:
                self.out_queue.put_nowait(audio_message)
                logger.debug(f"Audio data queued successfully, {len(audio_bytes)} bytes")
            except asyncio.QueueFull:
                logger.debug("Audio queue full, skipping audio chunk")
            
        except Exception as e:
            logger.error(f"Error sending audio data: {e}")
    
    async def send_text(self, text: str):
        """Send text message to Gemini"""
        if not self.session or not self.is_active:
            logger.debug("Session not active, cannot send text")
            return
            
        try:
            # Send text directly like in your working code
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
                # Continue waiting
                logger.debug("Response timeout, continuing to wait...")
                continue
                
            except Exception as e:
                logger.error(f"Error getting response: {e}")
                break
    
    async def cleanup(self):
        """Cleanup resources"""
        logger.info("Starting cleanup...")
        
        self.is_active = False
        
        # Cancel tasks
        if self._response_task and not self._response_task.done():
            self._response_task.cancel()
            try:
                await self._response_task
            except asyncio.CancelledError:
                pass
        
        if self._send_task and not self._send_task.done():
            self._send_task.cancel()
            try:
                await self._send_task
            except asyncio.CancelledError:
                pass
        
        # Close session
        if self.session and hasattr(self, '_session_context'):
            try:
                await self._session_context.__aexit__(None, None, None)
                logger.info("Gemini session closed successfully")
            except Exception as e:
                logger.error(f"Error closing Gemini session: {e}")
            finally:
                self.session = None
                self._session_context = None
        
        # Clear queues
        while self.out_queue and not self.out_queue.empty():
            try:
                self.out_queue.get_nowait()
            except asyncio.QueueEmpty:
                break
        
        while not self.response_queue.empty():
            try:
                self.response_queue.get_nowait()
            except asyncio.QueueEmpty:
                break
        
        logger.info("Cleanup completed")

# Test function matching your working code style
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