import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, MicOff, Video, VideoOff, Phone, PhoneOff } from 'lucide-react';

// WebSocket Hook
const useWebSocket = (url, onMessage) => {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const connectionReadyRef = useRef(false);
  const connectionAttemptRef = useRef(false);
  const reconnectTimeoutRef = useRef(null);

  useEffect(() => {
    if (!url || connectionAttemptRef.current) return;

    connectionAttemptRef.current = true;
    console.log('Attempting WebSocket connection to:', url);

    const connectWebSocket = () => {
      try {
        const ws = new WebSocket(url);
        
        ws.onopen = () => {
          console.log('WebSocket connected successfully');
          setSocket(ws);
          setIsConnected(true);
          connectionAttemptRef.current = false;
          
          // Clear any pending reconnect
          if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
          }
          
          // Delay to ensure backend is ready
          setTimeout(() => {
            connectionReadyRef.current = true;
          }, 1500);
        };
        
        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            onMessage(data);
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
          }
        };
        
        ws.onclose = (event) => {
          console.log('WebSocket disconnected', event.code, event.reason);
          setIsConnected(false);
          connectionReadyRef.current = false;
          setSocket(null);
          connectionAttemptRef.current = false;
          
          // Don't attempt reconnect for intentional closes or insufficient resources
          if (event.code !== 1000 && event.code !== 1006) {
            // Attempt reconnect after delay
            reconnectTimeoutRef.current = setTimeout(() => {
              if (!connectionAttemptRef.current) {
                console.log('Attempting to reconnect...');
                connectWebSocket();
              }
            }, 3000);
          }
        };
        
        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          connectionAttemptRef.current = false;
        };
        
        return ws;
      } catch (error) {
        console.error('Failed to create WebSocket:', error);
        connectionAttemptRef.current = false;
        return null;
      }
    };

    const ws = connectWebSocket();

    return () => {
      connectionReadyRef.current = false;
      connectionAttemptRef.current = false;
      
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close(1000, 'Component unmounted');
      }
    };
  }, [url]); // Remove onMessage from dependencies to prevent reconnections

  const sendMessage = useCallback((message) => {
    if (socket && socket.readyState === WebSocket.OPEN && connectionReadyRef.current) {
      try {
        socket.send(JSON.stringify(message));
        return true;
      } catch (error) {
        console.error('Error sending message:', error);
        return false;
      }
    }
    return false;
  }, [socket]);

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
  const audioContextRef = useRef(null);
  const audioProcessorRef = useRef(null);
  const frameIntervalRef = useRef(null);
  const audioIntervalRef = useRef(null);
  const audioQueueRef = useRef([]);
  const isPlayingAudioRef = useRef(false);
  const connectionStatusRef = useRef('disconnected');
  
  const clientIdRef = useRef(null);
  if (!clientIdRef.current) {
    clientIdRef.current = Math.random().toString(36).substring(2, 11);
  }
  
  // WebSocket connection
  const { isConnected, sendMessage } = useWebSocket(
    isActive ? `ws://localhost:8000/ws/${clientIdRef.current}` : null,
    useCallback((data) => {
      console.log('Received message:', data);
      
      if (data.type === 'connection_status') {
        setConnectionStatus(data.status);
        connectionStatusRef.current = data.status;
        console.log('🔗 Connection status updated:', data.status);
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
        
        if (response.transcription) {
          setCurrentResponse(response.transcription);
        }
        
        if (response.audio) {
          playAudioResponse(response.audio);
        }
      }
    }, [])
  );
  
  // Effect to handle disconnection
  useEffect(() => {
    if (!isConnected && isActive) {
      console.log('Connection lost, stopping chat');
      stopChat();
    }
  }, [isConnected]);

  // Play audio response from AI with queue to prevent overlapping
  const playAudioResponse = async (audioBase64) => {
    // Add to queue
    audioQueueRef.current.push(audioBase64);
    
    // If already playing, just queue it
    if (isPlayingAudioRef.current) {
      console.log('🎵 Audio queued, currently playing');
      return;
    }
    
    // Start playing queue
    await playAudioQueue();
  };

  const playAudioQueue = async () => {
    if (audioQueueRef.current.length === 0 || isPlayingAudioRef.current) {
      return;
    }
    
    isPlayingAudioRef.current = true;
    
    while (audioQueueRef.current.length > 0) {
      const audioBase64 = audioQueueRef.current.shift();
      
      try {
        console.log('🎵 Playing audio chunk, base64 length:', audioBase64.length);
        
        // Decode base64 audio data
        const audioData = atob(audioBase64);
        const audioArray = new Uint8Array(audioData.length);
        for (let i = 0; i < audioData.length; i++) {
          audioArray[i] = audioData.charCodeAt(i);
        }
        
        // Create or resume audio context
        if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
          audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({
            sampleRate: 24000
          });
        }
        
        const audioContext = audioContextRef.current;
        
        // Resume audio context if suspended
        if (audioContext.state === 'suspended') {
          await audioContext.resume();
        }
        
        // For raw PCM data from Gemini (16-bit PCM at 24kHz)
        const int16Array = new Int16Array(audioArray.buffer);
        const float32Array = new Float32Array(int16Array.length);
        
        // Convert 16-bit PCM to Float32Array
        for (let i = 0; i < int16Array.length; i++) {
          float32Array[i] = int16Array[i] / 32768.0;
        }
        
        // Create audio buffer
        const audioBuffer = audioContext.createBuffer(1, float32Array.length, 24000);
        audioBuffer.getChannelData(0).set(float32Array);
        
        // Play the audio and wait for it to finish
        await new Promise((resolve) => {
          const source = audioContext.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(audioContext.destination);
          
          source.onended = () => {
            console.log('🎵 Audio chunk finished, duration:', audioBuffer.duration, 'seconds');
            resolve();
          };
          
          source.start();
        });
        
        // Small gap between chunks
        await new Promise(resolve => setTimeout(resolve, 50));
        
      } catch (error) {
        console.error('Error playing audio chunk:', error);
      }
    }
    
    isPlayingAudioRef.current = false;
    console.log('🎵 Audio queue finished');
  };

  // Initialize media streams
  const initializeMedia = async () => {
    try {
      console.log('Requesting camera and microphone access...');
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          width: { ideal: 640, max: 1280 },
          height: { ideal: 480, max: 720 },
          facingMode: 'user'
        },
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      
      console.log('Media stream obtained:', stream);
      console.log('Video tracks:', stream.getVideoTracks());
      console.log('Audio tracks:', stream.getAudioTracks());
      
      mediaStreamRef.current = stream;
      
      if (videoRef.current) {
        const video = videoRef.current;
        
        // Set video properties BEFORE setting srcObject
        video.muted = true;
        video.playsInline = true;
        video.autoplay = true;
        video.controls = false;
        
        console.log('Setting video srcObject...');
        
        // Force reset video element
        video.srcObject = null;
        video.load();
        
        // Wait a bit then set the stream
        await new Promise(resolve => setTimeout(resolve, 100));
        
        video.srcObject = stream;
        
        // Force video to be visible with important styles
        video.style.display = 'block !important';
        video.style.width = '100%';
        video.style.height = '100%';
        video.style.objectFit = 'cover';
        video.style.backgroundColor = 'black';
        
        console.log('📹 Stream set, video tracks:', stream.getVideoTracks().length);
        
        // Wait for video to load and play with better handling
        await new Promise((resolve) => {
          let resolved = false;
          
          const checkAndPlay = async () => {
            if (resolved) return;
            
            console.log('📹 Checking video state:');
            console.log('- readyState:', video.readyState);
            console.log('- videoWidth:', video.videoWidth);
            console.log('- videoHeight:', video.videoHeight);
            console.log('- paused:', video.paused);
            
            if (video.readyState >= 2 && video.videoWidth > 0) {
              try {
                await video.play();
                console.log('✅ Video playing successfully!');
                resolved = true;
                resolve();
              } catch (err) {
                console.error('❌ Play failed:', err);
                // Force play without waiting
                resolved = true;
                resolve();
              }
            } else if (video.readyState >= 1) {
              // Metadata loaded but waiting for data
              console.log('⏳ Video metadata loaded, waiting for data...');
              setTimeout(checkAndPlay, 500);
            }
          };
          
          // Event handlers
          video.onloadedmetadata = () => {
            console.log('📹 Video metadata loaded event');
            setTimeout(checkAndPlay, 100);
          };
          
          video.oncanplay = () => {
            console.log('📹 Video can play event');
            checkAndPlay();
          };
          
          video.onloadeddata = () => {
            console.log('📹 Video data loaded event');
            checkAndPlay();
          };
          
          video.onplay = () => {
            console.log('📹 Video play event fired');
          };
          
          video.onerror = (err) => {
            console.error('📹 Video error:', err);
            resolved = true;
            resolve();
          };
          
          // Immediate check
          setTimeout(checkAndPlay, 200);
          
          // Safety timeout
          setTimeout(() => {
            if (!resolved) {
              console.log('⏰ Video load timeout - resolving anyway');
              resolved = true;
              resolve();
            }
          }, 5000);
        });
      }
      
      // Initialize audio processing
      await initializeAudioProcessing(stream);
      
      // Start sending video frames after connection is ready
      console.log('🎥 Scheduling video capture start...');
      
      // Wait for WebSocket connection to be established
      const waitForConnection = () => {
        console.log('🔍 Checking connection state:', { 
          isConnected, 
          connectionStatus, 
          connectionStatusRef: connectionStatusRef.current 
        });
        // Use connectionStatusRef since it updates immediately
        if (connectionStatusRef.current === 'connected') {
          console.log('🎥 Connection ready, starting video capture');
          startVideoCapture();
        } else {
          console.log('🎥 Waiting for connection...', { 
            isConnected, 
            connectionStatus, 
            connectionStatusRef: connectionStatusRef.current 
          });
          setTimeout(waitForConnection, 500);
        }
      };
      
      setTimeout(waitForConnection, 1000);
      
      return true;
    } catch (error) {
      console.error('Error accessing media devices:', error);
      
      if (error.name === 'NotAllowedError') {
        alert('Camera and microphone access denied. Please allow access and refresh the page.');
      } else if (error.name === 'NotFoundError') {
        alert('No camera or microphone found. Please check your devices.');
      } else {
        alert('Error accessing camera and microphone: ' + error.message);
      }
      
      return false;
    }
  };

  // Initialize audio processing and streaming using MediaRecorder
  const initializeAudioProcessing = async (stream) => {
    try {
      console.log('Initializing audio processing...');
      
      // Create audio context for visualization only
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      audioContextRef.current = audioContext;
      
      // Resume if suspended
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }
      
      // Audio visualization using AnalyserNode (modern approach)
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      
      source.connect(analyser);
      
      // Audio level calculation for visualization
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateAudioLevel = () => {
        if (!isMuted && isActive) {
          analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const average = sum / dataArray.length / 255;
          setAudioLevel(average * 3);
          requestAnimationFrame(updateAudioLevel);
        }
      };
      updateAudioLevel();
      
      // Use ScriptProcessorNode for reliable audio capture (fallback for compatibility)
      const processor = audioContext.createScriptProcessor(1024, 1, 1);
      let audioBuffer = [];
      
      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        
        // Store audio data for sending if not muted and connected
        if (!isMuted && connectionStatusRef.current === 'connected') {
          audioBuffer.push(...inputData);
        }
      };
      
      source.connect(processor);
      processor.connect(audioContext.destination);
      audioProcessorRef.current = processor;
      
      // Send audio data periodically - match working code frequency
      audioIntervalRef.current = setInterval(() => {
        if (audioBuffer.length > 0 && !isMuted && connectionStatusRef.current === 'connected') {
          // Convert Float32Array to 16-bit PCM
          const pcmData = new Int16Array(audioBuffer.length);
          for (let i = 0; i < audioBuffer.length; i++) {
            const s = Math.max(-1, Math.min(1, audioBuffer[i]));
            pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
          }
          
          // Convert to base64 and send
          const uint8Array = new Uint8Array(pcmData.buffer);
          const base64Audio = btoa(String.fromCharCode(...uint8Array));
          
          sendMessage({
            type: 'audio_data',
            data: base64Audio
          });
          
          console.log('📤 Audio data sent, length:', base64Audio.length);
          
          // Clear buffer
          audioBuffer = [];
        }
      }, 64); // Match working code chunk processing frequency
      
      console.log('✅ Audio processing initialized successfully');
      
    } catch (error) {
      console.error('Error initializing audio processing:', error);
    }
  };

  // Capture and send video frames
  const startVideoCapture = () => {
    console.log('🎥 Starting video capture...');
    const canvas = canvasRef.current;
    const video = videoRef.current;
    
    if (!canvas || !video) {
      console.error('❌ Canvas or video element not found');
      return;
    }
    
    const ctx = canvas.getContext('2d');
    
    // Wait for connection to be ready before starting
    setTimeout(() => {
      console.log('🎥 Setting up video capture interval...');
      let frameCount = 0;
      
      const captureFrame = () => {
        // Check all conditions
        if (!video) {
          console.log('❌ Video element not found');
          return;
        }
        if (video.readyState !== 4) {
          console.log('❌ Video not ready, readyState:', video.readyState);
          return;
        }
        if (!isVideoOn) {
          console.log('❌ Video is off');
          return;
        }
        if (connectionStatusRef.current !== 'connected') {
          console.log('❌ Not connected, status:', connectionStatusRef.current);
          return;
        }
        if (video.videoWidth === 0 || video.videoHeight === 0) {
          console.log('❌ Video dimensions are 0');
          return;
        }
        
        // Set canvas size to match video
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        console.log(`🎥 Capturing frame ${frameCount++}, dimensions: ${canvas.width}x${canvas.height}`);
        
        try {
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
                console.log('📤 Video frame sent, size:', base64.length, 'chars');
              };
              reader.readAsDataURL(blob);
            } else {
              console.error('❌ Failed to create blob from canvas');
            }
          }, 'image/jpeg', 0.8);
        } catch (error) {
          console.error('❌ Error capturing frame:', error);
        }
      };
      
      // Initial check
      console.log('🎥 Video element check:');
      console.log('- Video exists:', !!video);
      console.log('- Video readyState:', video?.readyState);
      console.log('- Video dimensions:', video?.videoWidth, 'x', video?.videoHeight);
      console.log('- Is connected:', isConnected);
      console.log('- Is video on:', isVideoOn);
      
      frameIntervalRef.current = setInterval(captureFrame, 1000); // 1 FPS like working code
      console.log('✅ Video capture interval started');
    }, 2000); // Wait 2 seconds for connection
  };

  // Start chat
  const startChat = async () => {
    console.log('Starting chat...');
    const success = await initializeMedia();
    if (success) {
      console.log('Media initialized successfully');
      setIsActive(true);
      setConnectionStatus('connecting');
    } else {
      console.log('Failed to initialize media');
    }
  };

  // Debug function to check camera
  const testCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      console.log('Camera test successful:', stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (error) {
      console.error('Camera test failed:', error);
    }
  };

  // Test text message to AI
  const testTextMessage = () => {
    if (connectionStatusRef.current === 'connected') {
      sendMessage({
        type: 'text_message',
        text: 'Hello, can you hear me? Please respond.'
      });
      console.log('Test text message sent');
    } else {
      console.log('Not connected, cannot send test message. Status:', connectionStatusRef.current);
    }
  };

  // Stop chat
  const stopChat = () => {
    setIsActive(false);
    setConnectionStatus('disconnected');
    setAudioLevel(0);
    
    // Clear intervals
    if (frameIntervalRef.current) {
      clearInterval(frameIntervalRef.current);
    }
    if (audioIntervalRef.current) {
      clearInterval(audioIntervalRef.current);
    }
    
    // Stop media tracks
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
    }
    
    // Close audio contexts
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    
    // Stop audio processor
    if (audioProcessorRef.current) {
      try {
        if (typeof audioProcessorRef.current.disconnect === 'function') {
          audioProcessorRef.current.disconnect();
        }
        if (typeof audioProcessorRef.current.stop === 'function') {
          audioProcessorRef.current.stop();
        }
      } catch (error) {
        console.log('Error stopping audio processor:', error);
      }
      audioProcessorRef.current = null;
    }
  };

  // Toggle mute
  const toggleMute = () => {
    if (mediaStreamRef.current) {
      const audioTracks = mediaStreamRef.current.getAudioTracks();
      audioTracks.forEach(track => {
        track.enabled = isMuted;
      });
    }
    setIsMuted(!isMuted);
  };

  // Toggle video
  const toggleVideo = () => {
    if (mediaStreamRef.current) {
      const videoTracks = mediaStreamRef.current.getVideoTracks();
      videoTracks.forEach(track => {
        track.enabled = isVideoOn;
      });
    }
    setIsVideoOn(!isVideoOn);
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
            
            <div className="flex flex-col space-y-4">
              <button
                onClick={startChat}
                className="px-8 py-4 bg-gradient-to-r from-purple-600 to-blue-600 rounded-full font-semibold text-lg hover:from-purple-700 hover:to-blue-700 transition-all duration-300 transform hover:scale-105 shadow-lg"
              >
                <Phone className="inline mr-2" size={20} />
                Start Video Chat
              </button>
              
              <button
                onClick={testCamera}
                className="px-6 py-2 bg-gray-600 rounded-full font-medium text-sm hover:bg-gray-700 transition-all duration-300"
              >
                Test Camera
              </button>
            </div>
          </div>
        ) : (
          // Active Chat Interface
          <div className="w-full max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Video Feed - Half Screen */}
            <div className="space-y-6">
              <div className="relative bg-black rounded-xl overflow-hidden shadow-2xl">
                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  playsInline
                  style={{
                    width: '100%',
                    height: '50vh',
                    objectFit: 'cover',
                    display: isVideoOn ? 'block' : 'none',
                    backgroundColor: 'black'
                  }}
                />
                {!isVideoOn && (
                  <div className="w-full h-[50vh] flex items-center justify-center bg-gray-800">
                    <VideoOff size={48} className="text-gray-500" />
                  </div>
                )}
                <canvas
                  ref={canvasRef}
                  className="hidden"
                />
                
                {/* Live indicator */}
                {isVideoOn && connectionStatus === 'connected' && (
                  <div className="absolute top-4 left-4 flex items-center space-x-2 bg-red-600 px-3 py-1 rounded-full">
                    <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                    <span className="text-xs font-semibold">LIVE</span>
                  </div>
                )}
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
                <AnimatedOrb isActive={isActive && connectionStatus === 'connected'} audioLevel={audioLevel} />
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
                  Status: {connectionStatus === 'connected' ? 'Connected' : 'Connecting...'}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {isMuted ? 'Microphone muted' : 'Microphone active'}
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
              onClick={toggleMute}
              className={`p-3 rounded-full transition-all duration-300 ${
                isMuted ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-600 hover:bg-gray-700'
              }`}
            >
              {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
            </button>
            
            <button
              onClick={toggleVideo}
              className={`p-3 rounded-full transition-all duration-300 ${
                !isVideoOn ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-600 hover:bg-gray-700'
              }`}
            >
              {isVideoOn ? <Video size={20} /> : <VideoOff size={20} />}
            </button>
            
            <button
              onClick={testTextMessage}
              className="p-3 rounded-full bg-blue-600 hover:bg-blue-700 transition-all duration-300"
              title="Send test message"
            >
              💬
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