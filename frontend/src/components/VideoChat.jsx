import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, MicOff, Video, VideoOff, Phone, PhoneOff } from 'lucide-react';

// WebSocket Hook
const useWebSocket = (url, onMessage) => {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!url) return;

    const ws = new WebSocket(url);
    
    ws.onopen = () => {
      setIsConnected(true);
      setSocket(ws);
      console.log('WebSocket connected');
    };
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      onMessage(data);
    };
    
    ws.onclose = () => {
      setIsConnected(false);
      setSocket(null);
      console.log('WebSocket disconnected');
    };
    
    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    return () => {
      ws.close();
    };
  }, [url, onMessage]);

  const sendMessage = useCallback((message) => {
    if (socket && isConnected) {
      socket.send(JSON.stringify(message));
    }
  }, [socket, isConnected]);

  return { socket, isConnected, sendMessage };
};

// Animated Orb Component
const AnimatedOrb = ({ isActive, audioLevel = 0 }) => {
  const baseSize = 120;
  const pulseSize = baseSize + (audioLevel * 40);
  
  return (
    <div className="relative flex items-center justify-center">
      {/* Main orb */}
      <div 
        className={`relative rounded-full transition-all duration-300 ${
          isActive ? 'animate-pulse' : ''
        }`}
        style={{
          width: `${pulseSize}px`,
          height: `${pulseSize}px`,
          background: `radial-gradient(circle, 
            rgba(147, 51, 234, 0.8) 0%, 
            rgba(59, 130, 246, 0.6) 50%, 
            rgba(16, 185, 129, 0.4) 100%)`,
          boxShadow: `0 0 ${pulseSize/2}px rgba(147, 51, 234, 0.3)`,
        }}
      >
        {/* Inner core */}
        <div 
          className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 rounded-full bg-white opacity-20"
          style={{
            width: `${pulseSize * 0.3}px`,
            height: `${pulseSize * 0.3}px`,
          }}
        />
        
        {/* Rotating rings */}
        {isActive && (
          <>
            <div className="absolute inset-0 rounded-full border-2 border-purple-400 opacity-30 animate-spin" 
                 style={{ animationDuration: '3s' }} />
            <div className="absolute inset-2 rounded-full border border-blue-400 opacity-20 animate-spin" 
                 style={{ animationDuration: '2s', animationDirection: 'reverse' }} />
          </>
        )}
      </div>
      
      {/* Floating particles */}
      {isActive && (
        <div className="absolute inset-0">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="absolute w-2 h-2 bg-purple-400 rounded-full opacity-60 animate-bounce"
              style={{
                top: `${30 + Math.sin(i) * 40}%`,
                left: `${30 + Math.cos(i) * 40}%`,
                animationDelay: `${i * 0.2}s`,
                animationDuration: '2s',
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// Audio Visualizer Component
const AudioVisualizer = ({ audioLevel, isActive }) => {
  const bars = 20;
  
  return (
    <div className="flex items-end justify-center space-x-1 h-16">
      {[...Array(bars)].map((_, i) => {
        const height = isActive 
          ? Math.max(4, audioLevel * 60 * (0.5 + Math.random() * 0.5))
          : 4;
        
        return (
          <div
            key={i}
            className="bg-gradient-to-t from-purple-500 to-blue-400 rounded-full transition-all duration-100"
            style={{
              width: '3px',
              height: `${height}px`,
              animationDelay: `${i * 50}ms`,
            }}
          />
        );
      })}
    </div>
  );
};

// Main Video Chat Component
const VideoChat = () => {
  const [isActive, setIsActive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [audioLevel, setAudioLevel] = useState(0);
  const [messages, setMessages] = useState([]);
  const [currentResponse, setCurrentResponse] = useState('');
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const mediaStreamRef = useRef(null);
  
  const clientId = Math.random().toString(36).substr(2, 9);
  
  // WebSocket connection
  const { isConnected, sendMessage } = useWebSocket(
    isActive ? `ws://localhost:8000/ws/${clientId}` : null,
    useCallback((data) => {
      console.log('Received message:', data);
      
      if (data.type === 'connection_status') {
        setConnectionStatus(data.status);
      }
      
      if (data.type === 'response') {
        const response = data.data;
        
        if (response.text) {
          setCurrentResponse(response.text);
          setMessages(prev => [...prev, { type: 'ai', content: response.text }]);
        }
        
        if (response.user_transcription) {
          setMessages(prev => [...prev, { type: 'user', content: response.user_transcription }]);
        }
        
        if (response.audio) {
          // Handle audio response (simplified for now)
          console.log('Received audio response');
        }
      }
    }, [])
  );

  // Initialize media streams
  const initializeMedia = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        }
      });
      
      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      
      // Start sending video frames and audio
      startVideoCapture();
      
      return true;
    } catch (error) {
      console.error('Error accessing media devices:', error);
      alert('Please allow camera and microphone access to use the video chat.');
      return false;
    }
  };

  // Capture and send video frames
  const startVideoCapture = () => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    
    if (!canvas || !video) return;
    
    const ctx = canvas.getContext('2d');
    
    const captureFrame = () => {
      if (!isActive || !isVideoOn) return;
      
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (blob) {
          const reader = new FileReader();
          reader.onload = () => {
            const base64 = reader.result.split(',')[1];
            sendMessage({
              type: 'video_frame',
              data: base64
            });
          };
          reader.readAsDataURL(blob);
        }
      }, 'image/jpeg', 0.8);
      
      setTimeout(captureFrame, 1000); // Send frame every second
    };
    
    // Simulate audio level for visualization
    const updateAudioLevel = () => {
      if (!isActive) return;
      setAudioLevel(Math.random() * 0.8 + 0.2);
      setTimeout(updateAudioLevel, 100);
    };
    
    captureFrame();
    updateAudioLevel();
  };

  // Start chat
  const startChat = async () => {
    const success = await initializeMedia();
    if (success) {
      setIsActive(true);
      setConnectionStatus('connecting');
    }
  };

  // Stop chat
  const stopChat = () => {
    setIsActive(false);
    setConnectionStatus('disconnected');
    
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-blue-900 text-white">
      {/* Header */}
      <div className="p-6 text-center">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
          AI Video Chat Platform
        </h1>
        <p className="text-gray-300 mt-2">
          {connectionStatus === 'connected' ? '🟢 Connected to Gemini AI' : 
           connectionStatus === 'connecting' ? '🟡 Connecting...' : 
           '🔴 Disconnected'}
        </p>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        {!isActive ? (
          // Start Screen
          <div className="text-center space-y-8">
            <div className="space-y-4">
              <h2 className="text-2xl font-semibold">Ready to start your AI conversation?</h2>
              <p className="text-gray-400">Click the button below to begin video chat with Gemini AI</p>
            </div>
            
            <button
              onClick={startChat}
              className="px-8 py-4 bg-gradient-to-r from-purple-600 to-blue-600 rounded-full font-semibold text-lg hover:from-purple-700 hover:to-blue-700 transition-all duration-300 transform hover:scale-105 shadow-lg btn-glow"
            >
              <Phone className="inline mr-2" size={20} />
              Start Video Chat
            </button>
          </div>
        ) : (
          // Active Chat Interface
          <div className="w-full max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Video Feed */}
            <div className="space-y-6">
              <div className="relative bg-black rounded-xl overflow-hidden shadow-2xl">
                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  className={`w-full h-64 object-cover ${!isVideoOn ? 'hidden' : ''}`}
                />
                {!isVideoOn && (
                  <div className="w-full h-64 flex items-center justify-center bg-gray-800">
                    <VideoOff size={48} className="text-gray-500" />
                  </div>
                )}
                <canvas
                  ref={canvasRef}
                  width="640"
                  height="480"
                  className="hidden"
                />
              </div>
              
              {/* Audio Visualizer */}
              <div className="bg-black/20 rounded-xl p-4 backdrop-blur-sm">
                <AudioVisualizer audioLevel={audioLevel} isActive={!isMuted} />
              </div>
            </div>

            {/* AI Response Area */}
            <div className="space-y-6">
              {/* Animated Orb */}
              <div className="flex justify-center">
                <AnimatedOrb isActive={isActive} audioLevel={audioLevel} />
              </div>
              
              {/* Current Response */}
              {currentResponse && (
                <div className="bg-black/20 rounded-xl p-6 backdrop-blur-sm">
                  <h3 className="text-lg font-semibold mb-2 text-purple-300">AI Response:</h3>
                  <p className="text-gray-200">{currentResponse}</p>
                </div>
              )}
              
              {/* Connection Status */}
              <div className="bg-black/20 rounded-xl p-4 backdrop-blur-sm text-center">
                <p className="text-sm text-gray-400">
                  Status: {isConnected ? 'Connected' : 'Connecting...'}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      {isActive && (
        <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2">
          <div className="flex items-center space-x-4 bg-black/30 backdrop-blur-md rounded-full px-6 py-4">
            <button
              onClick={() => setIsMuted(!isMuted)}
              className={`p-3 rounded-full transition-all duration-300 ${
                isMuted ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-600 hover:bg-gray-700'
              }`}
            >
              {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
            </button>
            
            <button
              onClick={() => setIsVideoOn(!isVideoOn)}
              className={`p-3 rounded-full transition-all duration-300 ${
                !isVideoOn ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-600 hover:bg-gray-700'
              }`}
            >
              {isVideoOn ? <Video size={20} /> : <VideoOff size={20} />}
            </button>
            
            <button
              onClick={stopChat}
              className="p-3 rounded-full bg-red-600 hover:bg-red-700 transition-all duration-300"
            >
              <PhoneOff size={20} />
            </button>
          </div>
        </div>
      )}

      {/* Chat Messages */}
      {messages.length > 0 && (
        <div className="fixed right-4 top-20 bottom-20 w-80 bg-black/20 backdrop-blur-md rounded-xl p-4 overflow-y-auto">
          <h3 className="text-lg font-semibold mb-4 text-purple-300">Conversation</h3>
          <div className="space-y-3">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`p-3 rounded-lg ${
                  message.type === 'user' 
                    ? 'bg-blue-600/30 ml-4' 
                    : 'bg-purple-600/30 mr-4'
                }`}
              >
                <div className="text-xs opacity-70 mb-1">
                  {message.type === 'user' ? 'You' : 'AI'}
                </div>
                <div className="text-sm">{message.content}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoChat;