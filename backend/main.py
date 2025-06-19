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
    allow_origins=[
        "http://localhost:5173", 
        "http://127.0.0.1:5173",
        "http://localhost:3000", 
        "http://127.0.0.1:3000"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Store active connections
active_connections = {}

@app.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    await websocket.accept()
    logger.info(f"Client {client_id} connected")
    
    # Create Gemini client for this connection
    gemini_client = GeminiVideoChat()
    active_connections[client_id] = {
        "websocket": websocket,
        "gemini_client": gemini_client
    }
    
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
                            # Process video frame - pass base64 data directly
                            await gemini_client.send_video_frame(message["data"])
                            logger.info(f"Processed video frame from client {client_id}, size: {len(message['data'])} chars")
                        
                        elif message["type"] == "audio_data":
                            # Process audio data - pass the base64 string directly
                            await gemini_client.send_audio_data(message["data"])
                            logger.info(f"Processed audio data from client {client_id}, size: {len(message['data'])} chars")
                        
                        elif message["type"] == "text_message":
                            # Process text message
                            await gemini_client.send_text(message["text"])
                            logger.info(f"Processed text message from client {client_id}: {message['text']}")
                        
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
                        
                        # Log specific response types
                        if 'text' in response:
                            logger.info(f"Sent text response to {client_id}: {response['text'][:50]}...")
                        if 'audio' in response:
                            logger.info(f"Sent audio response to {client_id}")
                        if 'user_transcription' in response:
                            logger.info(f"User said: {response['user_transcription']}")
                            
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
        if client_id in active_connections:
            try:
                await active_connections[client_id]["gemini_client"].cleanup()
                logger.info(f"Cleaned up client {client_id}")
            except Exception as e:
                logger.error(f"Error during cleanup for client {client_id}: {e}")
            finally:
                del active_connections[client_id]

@app.get("/")
async def root():
    return {
        "message": "Video Chat API is running",
        "version": "1.0.0",
        "status": "healthy",
        "model": "gemini-2.0-flash-live-preview-04-09",
        "endpoints": {
            "websocket": "/ws/{client_id}",
            "health": "/health"
        }
    }

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "active_connections": len(active_connections),
        "connection_ids": list(active_connections.keys())
    }

@app.get("/test")
async def test_gemini():
    """Test endpoint to verify Gemini connection"""
    try:
        from gemini_client import test_gemini_client
        await test_gemini_client()
        return {"status": "success", "message": "Gemini connection test passed"}
    except Exception as e:
        return {"status": "error", "message": f"Gemini connection test failed: {str(e)}"}

if __name__ == "__main__":
    import uvicorn
    logger.info("Starting Video Chat API server...")
    uvicorn.run(
        "main:app",
        host="0.0.0.0", 
        port=8000,
        log_level="info",
        reload=True
    )