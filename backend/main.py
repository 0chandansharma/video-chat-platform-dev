from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import json
import base64
import logging
import traceback
from gemini_client import GeminiVideoChat

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Video Chat API", version="1.0.0")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],  # React dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Store active connections
active_connections = {}

class ConnectionManager:
    def __init__(self):
        self.active_connections = {}

    async def connect(self, websocket: WebSocket, client_id: str):
        await websocket.accept()
        gemini_client = GeminiVideoChat()
        self.active_connections[client_id] = {
            "websocket": websocket,
            "gemini_client": gemini_client
        }
        logger.info(f"Client {client_id} connected")
        return gemini_client

    async def disconnect(self, client_id: str):
        if client_id in self.active_connections:
            try:
                await self.active_connections[client_id]["gemini_client"].cleanup()
                logger.info(f"Client {client_id} disconnected and cleaned up")
            except Exception as e:
                logger.error(f"Error during cleanup for client {client_id}: {e}")
            finally:
                del self.active_connections[client_id]

    async def send_message(self, client_id: str, message: dict):
        if client_id in self.active_connections:
            try:
                websocket = self.active_connections[client_id]["websocket"]
                await websocket.send_text(json.dumps(message))
            except Exception as e:
                logger.error(f"Error sending message to client {client_id}: {e}")

manager = ConnectionManager()

@app.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    gemini_client = await manager.connect(websocket, client_id)
    
    try:
        # Start Gemini session
        await gemini_client.start_session()
        logger.info(f"Gemini session started for client {client_id}")
        
        # Send connection success message
        await websocket.send_text(json.dumps({
            "type": "connection_status",
            "status": "connected",
            "message": "Successfully connected to Gemini AI"
        }))
        
        # Handle incoming messages
        async def handle_messages():
            try:
                while True:
                    try:
                        data = await websocket.receive_text()
                        message = json.loads(data)
                        
                        if message["type"] == "video_frame":
                            # Process video frame
                            frame_data = base64.b64decode(message["data"])
                            await gemini_client.send_video_frame(frame_data)
                            logger.debug(f"Sent video frame from client {client_id}")
                        
                        elif message["type"] == "audio_data":
                            # Process audio data
                            audio_data = base64.b64decode(message["data"])
                            await gemini_client.send_audio_data(audio_data)
                            logger.debug(f"Sent audio data from client {client_id}")
                        
                        elif message["type"] == "text_message":
                            # Process text message
                            await gemini_client.send_text(message["text"])
                            logger.info(f"Sent text message from client {client_id}: {message['text']}")
                        
                        elif message["type"] == "ping":
                            # Handle ping for connection health
                            await websocket.send_text(json.dumps({
                                "type": "pong",
                                "timestamp": message.get("timestamp")
                            }))
                            
                    except json.JSONDecodeError as e:
                        logger.error(f"JSON decode error from client {client_id}: {e}")
                        await websocket.send_text(json.dumps({
                            "type": "error",
                            "message": "Invalid JSON format"
                        }))
                    except Exception as e:
                        logger.error(f"Error processing message from client {client_id}: {e}")
                        
            except WebSocketDisconnect:
                logger.info(f"Client {client_id} disconnected from message handler")
            except Exception as e:
                logger.error(f"Unexpected error in message handler for client {client_id}: {e}")
        
        # Handle Gemini responses
        async def handle_responses():
            try:
                async for response in gemini_client.get_responses():
                    try:
                        await websocket.send_text(json.dumps({
                            "type": "response",
                            "data": response
                        }))
                        logger.debug(f"Sent response to client {client_id}")
                    except Exception as e:
                        logger.error(f"Error sending response to client {client_id}: {e}")
                        break
            except Exception as e:
                logger.error(f"Error in response handler for client {client_id}: {e}")
        
        # Run both handlers concurrently
        await asyncio.gather(
            handle_messages(),
            handle_responses()
        )
        
    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for client {client_id}")
    except Exception as e:
        logger.error(f"WebSocket error for client {client_id}: {e}")
        traceback.print_exc()
        try:
            await websocket.send_text(json.dumps({
                "type": "error",
                "message": f"Server error: {str(e)}"
            }))
        except:
            pass
    finally:
        # Cleanup
        await manager.disconnect(client_id)

@app.get("/")
async def root():
    return {
        "message": "Video Chat API is running",
        "version": "1.0.0",
        "status": "healthy",
        "endpoints": {
            "websocket": "/ws/{client_id}",
            "health": "/health"
        }
    }

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "active_connections": len(manager.active_connections)
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",  # Use import string instead of app object
        host="0.0.0.0", 
        port=8000,
        log_level="info",
        reload=True
    )