import React, { useState, useEffect, useCallback, useRef } from 'react';
import { KanjiEntry, AppMode, ProgressState } from './types';
import { KANJI_DATA } from './kanjiData';
import { BookOpen, RotateCcw, BarChart, X, Home, List, ArrowRight, CheckCircle, XCircle, Search, Volume2, VolumeX, Music, Music2, Headphones, Speaker, Camera, CameraOff, Accessibility } from 'lucide-react';
import { PoseLandmarker, FilesetResolver, DrawingUtils } from "@mediapipe/tasks-vision";

const LOCAL_STORAGE_KEY = 'kanji_mastery_progress';
const BGM_FOCUS = "https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=lo-fi-hip-hop-114671.mp3"; 
const BGM_HAPPY = "https://cdn.pixabay.com/download/audio/2024/04/10/audio_5177df83c2.mp3?filename=upbeat-pop-funky-198858.mp3";

type MusicMode = 'OFF' | 'FOCUS' | 'HAPPY';
type PoseType = 'Both_Up' | 'Left_Up' | 'Right_Up' | 'Left_Side' | 'Right_Side' | 'Cross_Arms' | 'None';

// --- AUDIO UTILS (Web Audio API) ---
const playSynthSound = (type: 'correct' | 'wrong' | 'complete' | 'hover') => {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    
    const ctx = new AudioContext();
    const gainNode = ctx.createGain();
    gainNode.connect(ctx.destination);

    const now = ctx.currentTime;

    if (type === 'correct') {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.connect(gainNode);
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.1);
      
      gainNode.gain.setValueAtTime(0.1, now);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      
      osc.start(now);
      osc.stop(now + 0.5);
    } 
    else if (type === 'wrong') {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.connect(gainNode);
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.linearRampToValueAtTime(100, now + 0.3);

      gainNode.gain.setValueAtTime(0.1, now);
      gainNode.gain.linearRampToValueAtTime(0.001, now + 0.3);

      osc.start(now);
      osc.stop(now + 0.3);
    }
    else if (type === 'complete') {
      const notes = [523.25, 659.25, 783.99, 1046.50];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gn = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        osc.connect(gn);
        gn.connect(ctx.destination);
        
        const time = now + (i * 0.15);
        gn.gain.setValueAtTime(0, time);
        gn.gain.linearRampToValueAtTime(0.1, time + 0.05);
        gn.gain.exponentialRampToValueAtTime(0.001, time + 0.8);
        
        osc.start(time);
        osc.stop(time + 0.8);
      });
    }
    else if (type === 'hover') {
        const osc = ctx.createOscillator();
        osc.type = 'square';
        osc.connect(gainNode);
        osc.frequency.setValueAtTime(800, now);
        
        gainNode.gain.setValueAtTime(0.02, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        
        osc.start(now);
        osc.stop(now + 0.05);
    }
  } catch (e) {
    console.error("Audio play failed", e);
  }
};

const speakKanji = (card: KanjiEntry) => {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  
  const text = `${card.char}。音読み、${card.on.join('、')}。訓読み、${card.kun.join('、')}。`;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'ja-JP';
  utterance.rate = 0.9;
  utterance.volume = 0.8;
  window.speechSynthesis.speak(utterance);
};

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>(AppMode.HOME);
  const [progress, setProgress] = useState<ProgressState>({
    masteredIds: [],
    mistakeIds: [],
    lastReviewDate: null,
  });
  
  // Audio State
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [musicMode, setMusicMode] = useState<MusicMode>('OFF');
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Quiz State
  const [currentQueue, setCurrentQueue] = useState<KanjiEntry[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [quizFinished, setQuizFinished] = useState(false);
  
  // Multiple Choice State
  const [quizOptions, setQuizOptions] = useState<KanjiEntry[]>([]);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);

  // Stats State
  const [statsSearch, setStatsSearch] = useState('');

  // Camera & Pose State
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [poseModelLoading, setPoseModelLoading] = useState(false);
  const [detectedPose, setDetectedPose] = useState<PoseType>('None');
  const [gestureProgress, setGestureProgress] = useState(0); 
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const poseLandmarkerRef = useRef<PoseLandmarker | null>(null);
  const requestRef = useRef<number>(0);
  const lastVideoTimeRef = useRef<number>(-1);

  // Load progress
  useEffect(() => {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (saved) {
      try {
        setProgress(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load progress", e);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(progress));
  }, [progress]);

  // BGM
  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.loop = true;
    }

    const audio = audioRef.current;

    if (musicMode === 'OFF') {
      audio.pause();
    } else {
      const src = musicMode === 'FOCUS' ? BGM_FOCUS : BGM_HAPPY;
      const volume = musicMode === 'FOCUS' ? 0.2 : 0.15;
      
      if (audio.src !== src) {
        audio.src = src;
        audio.load();
      }
      audio.volume = volume;
      
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(error => {
          console.log("Audio autoplay prevented by browser", error);
        });
      }
    }
  }, [musicMode]);

  // Initialize Pose Landmarker
  useEffect(() => {
      const loadModel = async () => {
          if (poseLandmarkerRef.current) return;
          setPoseModelLoading(true);
          try {
              const vision = await FilesetResolver.forVisionTasks(
                  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/wasm"
              );
              const landmarker = await PoseLandmarker.createFromOptions(vision, {
                  baseOptions: {
                      modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
                      delegate: "GPU"
                  },
                  runningMode: "VIDEO",
                  numPoses: 1
              });
              poseLandmarkerRef.current = landmarker;
              console.log("Pose model loaded");
          } catch (error) {
              console.error("Error loading pose model:", error);
          } finally {
              setPoseModelLoading(false);
          }
      };
      
      if (cameraEnabled) {
          loadModel();
      }
  }, [cameraEnabled]);

  // Camera Loop & Pose Logic
  useEffect(() => {
      let stream: MediaStream | null = null;
      let drawingUtils: DrawingUtils | null = null;

      if (canvasRef.current) {
          drawingUtils = new DrawingUtils(canvasRef.current.getContext("2d")!);
      }

      const predictWebcam = () => {
          if (
              poseLandmarkerRef.current && 
              videoRef.current && 
              videoRef.current.readyState === 4 &&
              canvasRef.current
          ) {
              // Ensure timestamps are strictly increasing
              const startTimeMs = performance.now();
              if (lastVideoTimeRef.current >= startTimeMs) {
                  requestRef.current = requestAnimationFrame(predictWebcam);
                  return;
              }
              lastVideoTimeRef.current = startTimeMs;

              try {
                  const results = poseLandmarkerRef.current.detectForVideo(videoRef.current, startTimeMs);
                  
                  // Draw
                  const ctx = canvasRef.current.getContext("2d");
                  if (ctx) {
                      ctx.save();
                      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
                      if (results.landmarks) {
                          for (const landmark of results.landmarks) {
                              drawingUtils?.drawLandmarks(landmark, {
                                  radius: (data) => DrawingUtils.lerp(data.from!.z, -0.15, 0.1, 5, 1),
                                  color: "white",
                                  lineWidth: 2
                              });
                              drawingUtils?.drawConnectors(landmark, PoseLandmarker.POSE_CONNECTIONS, {
                                  color: "rgba(255, 255, 255, 0.7)",
                                  lineWidth: 3
                              });
                          }
                      }
                      ctx.restore();
                  }

                  // Logic
                  let currentPose: PoseType = 'None';

                  if (results.landmarks.length > 0) {
                      const lm = results.landmarks[0];
                      // 11: left shoulder, 12: right shoulder
                      // 13: left elbow, 14: right elbow
                      // 15: left wrist, 16: right wrist
                      // 23: left hip, 24: right hip
                      // 0: nose
                      
                      const nose = lm[0];
                      const leftWrist = lm[15];
                      const rightWrist = lm[16];
                      const leftShoulder = lm[11];
                      const rightShoulder = lm[12];
                      const leftHip = lm[23];
                      const rightHip = lm[24];

                      // Basic visibility check
                      const isLeftUp = leftWrist.y < nose.y;
                      const isRightUp = rightWrist.y < nose.y;
                      
                      // Cross Arms: Wrists close to each other
                      const wristDist = Math.sqrt(Math.pow(leftWrist.x - rightWrist.x, 2) + Math.pow(leftWrist.y - rightWrist.y, 2));
                      const CROSS_THRESH = 0.15;
                      
                      if (wristDist < CROSS_THRESH && leftWrist.y > nose.y) {
                          currentPose = 'Cross_Arms';
                      } else if (isLeftUp && isRightUp) {
                          currentPose = 'Both_Up';
                      } else if (isLeftUp) {
                          currentPose = 'Left_Up';
                      } else if (isRightUp) {
                          currentPose = 'Right_Up';
                      } else {
                          // Check sides
                          const leftSideY = leftWrist.y > leftShoulder.y && leftWrist.y < (leftHip.y + 0.2);
                          const rightSideY = rightWrist.y > rightShoulder.y && rightWrist.y < (rightHip.y + 0.2);
                          
                          // X check (Extension)
                          const isLeftOut = leftWrist.x > (leftShoulder.x + 0.05);
                          const isRightOut = rightWrist.x < (rightShoulder.x - 0.05);

                          if (leftSideY && isLeftOut) {
                              currentPose = 'Left_Side';
                          } else if (rightSideY && isRightOut) {
                              currentPose = 'Right_Side';
                          }
                      }
                  }
                  setDetectedPose(currentPose);

              } catch (e) {
                  console.warn("Pose recognition error", e);
              }
          }
          
          if (cameraEnabled) {
             requestRef.current = requestAnimationFrame(predictWebcam);
          }
      };

      const startCamera = async () => {
          if (cameraEnabled && videoRef.current) {
              try {
                  stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
                  if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    videoRef.current.onloadeddata = () => {
                        if (canvasRef.current && videoRef.current) {
                            canvasRef.current.width = videoRef.current.videoWidth;
                            canvasRef.current.height = videoRef.current.videoHeight;
                        }
                        predictWebcam();
                    };
                  }
              } catch (err) {
                  console.error("Camera denied or error", err);
                  setCameraEnabled(false);
              }
          }
      };

      if (cameraEnabled) {
          startCamera();
      } else {
          // Cleanup
          if (stream) {
              (stream as MediaStream).getTracks().forEach(track => track.stop());
          }
          if (requestRef.current) {
              cancelAnimationFrame(requestRef.current);
          }
          if (canvasRef.current) {
             const ctx = canvasRef.current.getContext('2d');
             ctx?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
          }
      }

      return () => {
          if (stream) {
              (stream as MediaStream).getTracks().forEach(track => track.stop());
          }
          if (requestRef.current) {
              cancelAnimationFrame(requestRef.current);
          }
      };
  }, [cameraEnabled]);

  const toggleMusicMode = () => {
    setMusicMode(prev => {
      if (prev === 'OFF') return 'FOCUS';
      if (prev === 'FOCUS') return 'HAPPY';
      return 'OFF';
    });
  };

  const generateOptions = useCallback((currentCard: KanjiEntry) => {
    const others = KANJI_DATA.filter(k => k.id !== currentCard.id);
    const shuffledOthers = others.sort(() => 0.5 - Math.random()).slice(0, 3);
    const options = [currentCard, ...shuffledOthers].sort(() => 0.5 - Math.random());
    setQuizOptions(options);
  }, []);

  const startQuiz = useCallback((isReview: boolean) => {
    let queue: KanjiEntry[] = [];
    
    if (isReview) {
      queue = KANJI_DATA.filter(k => progress.mistakeIds.includes(k.id));
      queue.sort(() => Math.random() - 0.5);
    } else {
      const unseen = KANJI_DATA.filter(k => !progress.masteredIds.includes(k.id) && !progress.mistakeIds.includes(k.id));
      const mistakes = KANJI_DATA.filter(k => progress.mistakeIds.includes(k.id));
      
      const batchSize = 10;
      queue = [...unseen.slice(0, batchSize)];
      if (queue.length < batchSize) {
        queue = [...queue, ...mistakes.slice(0, batchSize - queue.length)];
      }
      queue.sort(() => Math.random() - 0.5);
    }

    if (queue.length === 0) {
      if (isReview) {
        alert("No mistakes to review! Great job.");
        return;
      } else {
        alert("You have mastered all Kanji in the database!");
        return;
      }
    }

    setCurrentQueue(queue);
    setCurrentIndex(0);
    setIsFlipped(false);
    setIsAnswered(false);
    setSelectedOptionId(null);
    setQuizFinished(false);
    generateOptions(queue[0]);
    setMode(AppMode.QUIZ);
  }, [progress, generateOptions]);

  const handleOptionSelect = useCallback((selectedId: string) => {
    if (isAnswered) return;

    const currentCard = currentQueue[currentIndex];
    const isCorrect = selectedId === currentCard.id;
    
    setSelectedOptionId(selectedId);
    setIsAnswered(true);

    if (soundEnabled) {
        if (isCorrect) {
            playSynthSound('correct');
        } else {
            playSynthSound('wrong');
        }
        setTimeout(() => {
            speakKanji(currentCard);
        }, 400);
    }

    setProgress(prev => {
      const newMastered = new Set(prev.masteredIds);
      const newMistakes = new Set(prev.mistakeIds);

      if (isCorrect) {
        newMastered.add(currentCard.id);
        newMistakes.delete(currentCard.id);
      } else {
        newMastered.delete(currentCard.id);
        newMistakes.add(currentCard.id);
      }

      return {
        ...prev,
        masteredIds: Array.from(newMastered),
        mistakeIds: Array.from(newMistakes),
        lastReviewDate: new Date().toISOString()
      };
    });

    setTimeout(() => {
        setIsFlipped(true);
    }, 600);
  }, [isAnswered, currentQueue, currentIndex, soundEnabled]);

  const handleNextCard = useCallback(() => {
    if (currentIndex < currentQueue.length - 1) {
      const nextIndex = currentIndex + 1;
      setCurrentIndex(nextIndex);
      setIsFlipped(false);
      setIsAnswered(false);
      setSelectedOptionId(null);
      generateOptions(currentQueue[nextIndex]);
    } else {
      if (soundEnabled) {
          playSynthSound('complete');
      }
      setQuizFinished(true);
    }
  }, [currentIndex, currentQueue, generateOptions, soundEnabled]);

  const resetProgress = useCallback(() => {
    if (confirm("Are you sure you want to reset all progress?")) {
      setProgress({
        masteredIds: [],
        mistakeIds: [],
        lastReviewDate: null
      });
    }
  }, []);

  const handleGestureAction = useCallback(() => {
    // Reset progress
    setGestureProgress(0);

    if (mode === AppMode.HOME) {
        if (detectedPose === 'Both_Up') {
            startQuiz(false);
            if (soundEnabled) playSynthSound('hover');
        }
    } else if (mode === AppMode.QUIZ) {
        if (!isAnswered) {
            let optionIndex = -1;
            if (detectedPose === 'Left_Up') optionIndex = 0;
            if (detectedPose === 'Right_Up') optionIndex = 1;
            if (detectedPose === 'Left_Side') optionIndex = 2;
            if (detectedPose === 'Right_Side') optionIndex = 3;

            if (detectedPose === 'Cross_Arms') {
                setMode(AppMode.HOME);
                if (soundEnabled) playSynthSound('hover');
                return;
            }

            if (optionIndex !== -1 && optionIndex < quizOptions.length) {
                handleOptionSelect(quizOptions[optionIndex].id);
            }
        } else {
            // Answered State
            if (detectedPose === 'Both_Up') {
                handleNextCard();
            }
            if (detectedPose === 'Cross_Arms') {
                setMode(AppMode.HOME);
                if (soundEnabled) playSynthSound('hover');
            }
        }
    } else if (mode === AppMode.STATS) {
        if (detectedPose === 'Cross_Arms') {
            setMode(AppMode.HOME);
            if (soundEnabled) playSynthSound('hover');
        }
    }
  }, [detectedPose, mode, isAnswered, quizOptions, soundEnabled, startQuiz, handleOptionSelect, handleNextCard]);

  // Action Logic Loop
  useEffect(() => {
    if (!cameraEnabled || detectedPose === 'None') {
        setGestureProgress(0);
        return;
    }

    let animationFrameId: number;
    const startTime = Date.now();
    const HOLD_TIME = 1000; // ms

    const loop = () => {
        const now = Date.now();
        const elapsed = now - startTime;
        
        if (elapsed < HOLD_TIME) {
            const progress = (elapsed / HOLD_TIME) * 100;
            setGestureProgress(progress);
            animationFrameId = requestAnimationFrame(loop);
        } else {
            setGestureProgress(100);
            handleGestureAction();
        }
    };

    animationFrameId = requestAnimationFrame(loop);

    return () => {
        cancelAnimationFrame(animationFrameId);
    };
  }, [detectedPose, cameraEnabled, handleGestureAction]);

  const currentCard = currentQueue[currentIndex];

  // -- RENDER HELPERS --

  const NavControls = () => {
    let MusicIcon = Music;
    let musicColorClass = 'text-slate-400 hover:bg-slate-100';
    let musicTitle = 'Music Off';

    if (musicMode === 'FOCUS') {
      MusicIcon = Headphones;
      musicColorClass = 'bg-indigo-100 text-indigo-600';
      musicTitle = 'Focus Mode';
    } else if (musicMode === 'HAPPY') {
      MusicIcon = Music2;
      musicColorClass = 'bg-amber-100 text-amber-600';
      musicTitle = 'Happy Mode';
    }

    return (
      <div className="flex items-center gap-2">
          <button 
            onClick={() => setCameraEnabled(!cameraEnabled)}
            className={`p-2 rounded-full transition-colors ${cameraEnabled ? 'bg-red-100 text-red-600 animate-pulse' : 'text-slate-400 hover:bg-slate-100'}`}
            title="Toggle Body Pose Control"
          >
              {cameraEnabled ? <Accessibility className="w-5 h-5" /> : <CameraOff className="w-5 h-5" />}
          </button>
          <button 
            onClick={toggleMusicMode}
            className={`p-2 rounded-full transition-colors ${musicColorClass}`}
            title={`Toggle Music: ${musicTitle}`}
          >
              <MusicIcon className="w-5 h-5" />
          </button>
          <button 
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`p-2 rounded-full transition-colors ${soundEnabled ? 'bg-indigo-100 text-indigo-600' : 'text-slate-400 hover:bg-slate-100'}`}
            title="Toggle Sound Effects"
          >
              {soundEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
          </button>
      </div>
    );
  };

  const renderHome = () => (
    <div className="flex flex-col items-center justify-center min-h-[80vh] space-y-8 p-4">
      <div className="text-center space-y-2">
        <h1 className="text-4xl font-bold text-slate-800 tracking-wider">常用漢字</h1>
        <p className="text-slate-500">Joyo Kanji Mastery</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-md relative">
        <button 
          onClick={() => startQuiz(false)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white p-6 rounded-xl shadow-lg flex flex-col items-center transition-all transform hover:scale-105 active:scale-95 relative overflow-hidden"
        >
           {/* Pose Feedback Overlay */}
           {cameraEnabled && detectedPose === 'Both_Up' && (
              <div 
                  className="absolute left-0 top-0 bottom-0 bg-white/20 transition-all duration-100"
                  style={{ width: `${gestureProgress}%` }}
              />
          )}
          <BookOpen className="w-8 h-8 mb-2" />
          <span className="font-bold text-lg">Start Learning</span>
          {cameraEnabled && <span className="text-xs bg-indigo-500/50 px-2 rounded mt-2">🙌 Raise Both Hands</span>}
        </button>

        <button 
          onClick={() => startQuiz(true)}
          className={`p-6 rounded-xl shadow-lg flex flex-col items-center transition-all transform hover:scale-105 active:scale-95 ${
            progress.mistakeIds.length > 0 
              ? 'bg-amber-500 hover:bg-amber-600 text-white' 
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          }`}
          disabled={progress.mistakeIds.length === 0}
        >
          <RotateCcw className="w-8 h-8 mb-2" />
          <span className="font-bold text-lg">Review Mistakes</span>
          <span className="text-xs opacity-75 mt-1">{progress.mistakeIds.length} cards to fix</span>
        </button>
      </div>

      <div className="w-full max-w-md bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h2 className="text-lg font-semibold text-slate-700 mb-4 flex items-center">
          <BarChart className="w-5 h-5 mr-2" /> Progress
        </h2>
        <div className="space-y-4">
          <div>
            <div className="flex justify-between text-sm text-slate-600 mb-1">
              <span>Mastered</span>
              <span>{progress.masteredIds.length} / {KANJI_DATA.length}</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2.5">
              <div 
                className="bg-emerald-500 h-2.5 rounded-full transition-all duration-500" 
                style={{ width: `${(progress.masteredIds.length / KANJI_DATA.length) * 100}%` }}
              ></div>
            </div>
          </div>
          <div>
            <div className="flex justify-between text-sm text-slate-600 mb-1">
              <span>Needs Review</span>
              <span>{progress.mistakeIds.length}</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2.5">
              <div 
                className="bg-amber-500 h-2.5 rounded-full transition-all duration-500" 
                style={{ width: `${(progress.mistakeIds.length / KANJI_DATA.length) * 100}%` }}
              ></div>
            </div>
          </div>
        </div>
      </div>
      
      <button onClick={() => setMode(AppMode.STATS)} className="text-slate-400 text-sm underline hover:text-slate-600">
        View All Kanji
      </button>
    </div>
  );

  const renderQuiz = () => {
    if (quizFinished) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[80vh] p-4 text-center">
          <div className="bg-white p-8 rounded-2xl shadow-xl max-w-sm w-full animate-in zoom-in-50 duration-500 relative overflow-hidden">
            {cameraEnabled && detectedPose === 'Cross_Arms' && (
                 <div 
                    className="absolute left-0 top-0 bottom-0 bg-gray-100/50 transition-all duration-100"
                    style={{ width: `${gestureProgress}%`, zIndex: 0 }}
                />
            )}
            <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6 relative z-10">
                <CheckCircle className="w-10 h-10 text-emerald-600" />
            </div>
            <h2 className="text-2xl font-bold text-slate-800 mb-4 relative z-10">Session Complete!</h2>
            <p className="text-slate-600 mb-8 relative z-10">You've reviewed {currentQueue.length} cards.</p>
            <button 
              onClick={() => setMode(AppMode.HOME)}
              className="w-full bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 transition-colors relative z-10"
            >
              Back to Home {cameraEnabled && <span className="text-xs ml-2 opacity-80">(🙅 Cross Arms)</span>}
            </button>
          </div>
        </div>
      );
    }

    if (!currentCard) return <div>Loading...</div>;

    // Helper to get pose status for option buttons
    const getPoseStatus = (index: number) => {
        if (!cameraEnabled) return null;
        
        let targetPose = '';
        if (index === 0) targetPose = 'Left_Up';
        if (index === 1) targetPose = 'Right_Up';
        if (index === 2) targetPose = 'Left_Side';
        if (index === 3) targetPose = 'Right_Side';
        
        const isHovered = detectedPose === targetPose;
        
        return {
            icon: index === 0 ? '🙋 (L-Up)' : index === 1 ? '🙋 (R-Up)' : index === 2 ? '👈 (L-Side)' : '👉 (R-Side)',
            isHovered,
            progress: isHovered ? gestureProgress : 0
        };
    };

    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] p-4 max-w-2xl mx-auto w-full relative">
        {/* Progress Header */}
        <div className="w-full flex justify-between items-center mb-4 text-slate-500 text-sm font-mono">
          <span>Card {currentIndex + 1} / {currentQueue.length}</span>
          <button onClick={() => setMode(AppMode.HOME)} className="hover:text-red-500 flex items-center gap-1">
              <X className="w-5 h-5" /> 
              {cameraEnabled && <span className="text-xs">🙅</span>}
          </button>
        </div>

        {/* Card */}
        <div 
          className="relative w-full aspect-[16/9] md:aspect-[2/1] perspective-1000 mb-6 group cursor-pointer"
          onClick={() => setIsFlipped(!isFlipped)}
        >
          <div className={`relative w-full h-full transition-all duration-500 transform-style-3d shadow-xl rounded-2xl bg-white border border-slate-200 ${isFlipped ? 'rotate-y-180' : ''}`}>
            
            {/* Front */}
            <div className="absolute w-full h-full backface-hidden flex flex-col items-center justify-center p-4 relative">
               <button 
                 onClick={(e) => {
                     e.stopPropagation();
                     speakKanji(currentCard);
                 }}
                 className="absolute top-4 right-4 p-2 text-slate-300 hover:text-indigo-500 transition-colors rounded-full hover:bg-indigo-50"
                 title="Listen"
               >
                   <Speaker className="w-6 h-6" />
               </button>

              <span className="text-slate-400 text-xs uppercase tracking-widest mb-1">Kanji</span>
              <h1 className="text-7xl md:text-8xl text-slate-900 kanji-font">{currentCard.char}</h1>
              {currentCard.oldChar && (
                <span className="text-slate-400 kanji-font text-xl mt-1">({currentCard.oldChar})</span>
              )}
              {isAnswered && !isFlipped && (
                  <p className="absolute bottom-4 text-slate-400 text-xs">Tap to see details</p>
              )}
            </div>

            {/* Back */}
            <div className="absolute w-full h-full backface-hidden rotate-y-180 bg-slate-50 rounded-2xl flex flex-col items-center justify-center p-4 md:p-8 overflow-y-auto">
              <div className="grid grid-cols-2 gap-4 w-full text-center mb-4">
                <div className="bg-white p-2 rounded-lg border border-slate-100">
                  <h3 className="text-[10px] uppercase tracking-widest text-indigo-500 mb-1 font-bold">On-yomi</h3>
                  <p className="text-lg text-slate-800 font-medium">
                    {currentCard.on.length > 0 ? currentCard.on.join('・') : '-'}
                  </p>
                </div>
                <div className="bg-white p-2 rounded-lg border border-slate-100">
                  <h3 className="text-[10px] uppercase tracking-widest text-emerald-500 mb-1 font-bold">Kun-yomi</h3>
                  <p className="text-lg text-slate-800 font-medium">
                    {currentCard.kun.length > 0 ? currentCard.kun.join('・') : '-'}
                  </p>
                </div>
              </div>
              
              <div className="w-full text-left bg-white p-3 rounded-lg border border-slate-200">
                <h3 className="text-[10px] uppercase tracking-widest text-slate-400 mb-2">Examples</h3>
                <div className="flex flex-wrap gap-2">
                  {currentCard.examples.slice(0, 4).map((ex, i) => (
                    <span key={i} className="inline-block bg-slate-100 text-slate-700 px-2 py-1 rounded text-xs kanji-font">
                      {ex}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Multiple Choice Options */}
        <div className="w-full max-w-2xl mb-20">
             {!isAnswered ? (
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <p className="md:col-span-2 text-center text-slate-500 text-sm mb-2 flex items-center justify-center gap-2">
                        Select reading
                        {cameraEnabled && <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full flex items-center gap-1 animate-pulse"><Accessibility className="w-3 h-3"/> Body Pose Active</span>}
                    </p>
                     {quizOptions.map((opt, index) => {
                         const poseStatus = getPoseStatus(index);
                         
                         return (
                         <button
                            key={opt.id}
                            onClick={() => handleOptionSelect(opt.id)}
                            className="relative bg-white hover:bg-indigo-50 border-2 border-slate-200 hover:border-indigo-300 text-slate-700 p-4 rounded-xl shadow-sm transition-all text-left group overflow-hidden"
                         >
                            {/* Gesture Progress Bar Overlay */}
                            {poseStatus && poseStatus.isHovered && (
                                <div 
                                    className="absolute left-0 top-0 bottom-0 bg-indigo-100 transition-all duration-100"
                                    style={{ width: `${poseStatus.progress}%`, zIndex: 0 }}
                                />
                            )}
                            
                            <div className="relative flex flex-col gap-1 z-10">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-bold bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded">ON</span>
                                        <span className="font-medium">{opt.on.length > 0 ? opt.on.join('・') : '-'}</span>
                                    </div>
                                    {poseStatus && (
                                        <span className={`text-sm font-mono text-indigo-500 opacity-80 ${poseStatus.isHovered ? 'font-bold' : ''} transition-all`}>
                                            {poseStatus.icon}
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">KUN</span>
                                    <span className="font-medium">{opt.kun.length > 0 ? opt.kun.join('・') : '-'}</span>
                                </div>
                            </div>
                         </button>
                     )})}
                 </div>
             ) : (
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
                    {/* Feedback Area */}
                    <div className={`p-4 rounded-xl border-l-4 flex items-center justify-between ${selectedOptionId === currentCard.id ? 'bg-emerald-50 border-emerald-500' : 'bg-red-50 border-red-500'}`}>
                        <div className="flex items-center gap-3">
                            {selectedOptionId === currentCard.id ? (
                                <CheckCircle className="w-8 h-8 text-emerald-500" />
                            ) : (
                                <XCircle className="w-8 h-8 text-red-500" />
                            )}
                            <div>
                                <h3 className={`font-bold text-lg ${selectedOptionId === currentCard.id ? 'text-emerald-800' : 'text-red-800'}`}>
                                    {selectedOptionId === currentCard.id ? 'Correct!' : 'Incorrect'}
                                </h3>
                                <p className="text-sm opacity-80 text-slate-700">
                                    {selectedOptionId === currentCard.id ? 'Great job. Keep it up!' : 'Review the correct reading above.'}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 opacity-70">
                         {quizOptions.map((opt) => {
                             let borderColor = 'border-slate-200';
                             let bgColor = 'bg-white';
                             
                             if (opt.id === currentCard.id) {
                                 borderColor = 'border-emerald-500';
                                 bgColor = 'bg-emerald-50';
                             } else if (opt.id === selectedOptionId && selectedOptionId !== currentCard.id) {
                                 borderColor = 'border-red-500';
                                 bgColor = 'bg-red-50';
                             }

                             return (
                                <div
                                    key={opt.id}
                                    className={`${bgColor} ${borderColor} border-2 text-slate-700 p-3 rounded-xl shadow-sm text-left`}
                                >
                                    <div className="flex flex-col gap-1">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-bold bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded">ON</span>
                                            <span className="text-sm">{opt.on.length > 0 ? opt.on.join('・') : '-'}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">KUN</span>
                                            <span className="text-sm">{opt.kun.length > 0 ? opt.kun.join('・') : '-'}</span>
                                        </div>
                                    </div>
                                </div>
                             )
                         })}
                    </div>
                </div>
             )}
        </div>

        {/* Floating Next Button */}
        {isAnswered && (
            <div className="fixed bottom-6 left-0 right-0 flex justify-center px-4 z-50">
                <button 
                    onClick={handleNextCard}
                    className="relative overflow-hidden bg-indigo-600 hover:bg-indigo-700 text-white shadow-xl px-8 py-4 rounded-full font-bold text-lg flex items-center gap-2 transition-all transform hover:scale-105 active:scale-95 w-full max-w-sm justify-center"
                >
                    {cameraEnabled && detectedPose === 'Both_Up' && (
                         <div 
                            className="absolute left-0 top-0 bottom-0 bg-indigo-500/50 transition-all duration-100"
                            style={{ width: `${gestureProgress}%`, zIndex: 0 }}
                        />
                    )}
                    <span className="z-10 flex items-center gap-2">
                        Next Question <ArrowRight className="w-5 h-5" />
                        {cameraEnabled && <span className="ml-2 text-sm bg-white/20 px-2 rounded">🙌 Both Up</span>}
                    </span>
                </button>
            </div>
        )}
      </div>
    );
  };

  const renderStats = () => {
    const filteredData = KANJI_DATA.filter(k => 
      k.char.includes(statsSearch) || 
      k.on.some(r => r.includes(statsSearch)) || 
      k.kun.some(r => r.includes(statsSearch)) ||
      k.examples.some(e => e.includes(statsSearch))
    );

    return (
      <div className="p-4 md:p-8 max-w-4xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
              <h2 className="text-2xl font-bold flex items-center gap-2"><List /> Kanji List</h2>
              
              <div className="flex items-center gap-4 w-full md:w-auto">
                <div className="relative w-full md:w-64">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                    <input 
                        type="text" 
                        placeholder="Search char, reading..." 
                        className="w-full pl-10 pr-4 py-2 rounded-full border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                        value={statsSearch}
                        onChange={(e) => setStatsSearch(e.target.value)}
                    />
                </div>
                <button onClick={() => setMode(AppMode.HOME)} className="text-indigo-600 font-bold hover:underline whitespace-nowrap">Back {cameraEnabled && '(🙅 Cross Arms)'}</button>
              </div>
          </div>
          
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-[70vh]">
              <div className="grid grid-cols-12 bg-slate-50 p-4 font-bold text-slate-500 text-xs uppercase border-b border-slate-200 shrink-0">
                  <div className="col-span-2 md:col-span-1">Char</div>
                  <div className="col-span-4 md:col-span-2">On</div>
                  <div className="col-span-4 md:col-span-2">Kun</div>
                  <div className="hidden md:block md:col-span-6">Examples</div>
                  <div className="col-span-2 md:col-span-1 text-right">Status</div>
              </div>
              <div className="divide-y divide-slate-100 overflow-y-auto flex-grow">
                  {filteredData.length > 0 ? (
                    filteredData.map(k => {
                        const isMastered = progress.masteredIds.includes(k.id);
                        const isMistake = progress.mistakeIds.includes(k.id);
                        return (
                            <div key={k.id} className="grid grid-cols-12 p-4 items-center hover:bg-slate-50 transition-colors">
                                <div className="col-span-2 md:col-span-1 text-2xl kanji-font text-slate-800">
                                    {k.char}
                                    {k.oldChar && <span className="text-xs text-slate-400 block">{k.oldChar}</span>}
                                </div>
                                <div className="col-span-4 md:col-span-2 text-sm text-slate-600">{k.on.join(', ')}</div>
                                <div className="col-span-4 md:col-span-2 text-sm text-slate-600">{k.kun.join(', ')}</div>
                                <div className="hidden md:block md:col-span-6 text-xs text-slate-500 truncate">{k.examples.join(', ')}</div>
                                <div className="col-span-2 md:col-span-1 text-right">
                                    {isMastered && <span className="inline-block w-3 h-3 bg-emerald-400 rounded-full" title="Mastered"></span>}
                                    {isMistake && <span className="inline-block w-3 h-3 bg-amber-400 rounded-full" title="Needs Review"></span>}
                                    {!isMastered && !isMistake && <span className="inline-block w-3 h-3 bg-slate-200 rounded-full" title="New"></span>}
                                </div>
                            </div>
                        );
                    })
                  ) : (
                      <div className="p-8 text-center text-slate-400">No Kanji found matching "{statsSearch}"</div>
                  )}
              </div>
          </div>
          <div className="mt-8 text-center">
              <button onClick={resetProgress} className="text-red-400 text-sm hover:text-red-600 border border-red-200 px-4 py-2 rounded-lg hover:bg-red-50 transition-colors">
                  Reset All Progress
              </button>
          </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-blue-50 relative">
      <nav className="p-4 flex justify-between items-center max-w-6xl mx-auto">
        <div className="font-bold text-indigo-900 flex items-center gap-2 cursor-pointer" onClick={() => setMode(AppMode.HOME)}>
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-serif">漢</div>
            JoyoMastery
        </div>
        
        {/* Navigation Actions */}
        <div className="flex items-center gap-4">
            <NavControls />
            {mode !== AppMode.HOME && (
                <button onClick={() => setMode(AppMode.HOME)} className="p-2 hover:bg-white/50 rounded-full transition-colors">
                    <Home className="w-5 h-5 text-indigo-900" />
                </button>
            )}
        </div>
      </nav>
      
      <main>
        {mode === AppMode.HOME && renderHome()}
        {mode === AppMode.QUIZ && renderQuiz()}
        {mode === AppMode.STATS && renderStats()}
      </main>

      {/* Video & Canvas Overlay for Pose Recognition */}
      <div 
        className="fixed bottom-4 right-4 w-40 h-32 rounded-lg shadow-xl overflow-hidden border-2 border-white z-50 bg-black"
        style={{ display: cameraEnabled ? 'block' : 'none' }}
      >
        <video 
            ref={videoRef} 
            className="absolute top-0 left-0 w-full h-full object-cover transform scale-x-[-1]"
            autoPlay 
            playsInline
            muted
        />
        <canvas 
            ref={canvasRef}
            className="absolute top-0 left-0 w-full h-full object-cover transform scale-x-[-1]"
        />
        <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] p-1 text-center truncate">
           {poseModelLoading ? "Loading AI..." : detectedPose}
        </div>
      </div>
      
      <style>{`
        .rotate-y-180 {
          transform: rotateY(180deg);
        }
        .transform-style-3d {
          transform-style: preserve-3d;
        }
        .backface-hidden {
          backface-visibility: hidden;
        }
        .perspective-1000 {
          perspective: 1000px;
        }
      `}</style>
    </div>
  );
};

export default App;