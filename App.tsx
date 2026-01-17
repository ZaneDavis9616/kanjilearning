import React, { useState, useEffect, useCallback } from 'react';
import { KanjiEntry, AppMode, ProgressState } from './types';
import { KANJI_DATA } from './kanjiData';
import { BookOpen, RotateCcw, BarChart, X, Home, List, ArrowRight, CheckCircle, XCircle, Search } from 'lucide-react';

const LOCAL_STORAGE_KEY = 'kanji_mastery_progress';

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>(AppMode.HOME);
  const [progress, setProgress] = useState<ProgressState>({
    masteredIds: [],
    mistakeIds: [],
    lastReviewDate: null,
  });
  
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

  // Load progress on mount
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

  // Save progress on change
  useEffect(() => {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(progress));
  }, [progress]);

  const generateOptions = useCallback((currentCard: KanjiEntry) => {
    // Get 3 random distractors
    const others = KANJI_DATA.filter(k => k.id !== currentCard.id);
    const shuffledOthers = others.sort(() => 0.5 - Math.random()).slice(0, 3);
    // Combine with correct answer and shuffle
    const options = [currentCard, ...shuffledOthers].sort(() => 0.5 - Math.random());
    setQuizOptions(options);
  }, []);

  const startQuiz = (isReview: boolean) => {
    let queue: KanjiEntry[] = [];
    
    if (isReview) {
      // Review mode: Prioritize mistakes
      queue = KANJI_DATA.filter(k => progress.mistakeIds.includes(k.id));
      // Shuffle
      queue.sort(() => Math.random() - 0.5);
    } else {
      // New mode: Items not mastered yet, prioritize unseen, then mistakes
      const unseen = KANJI_DATA.filter(k => !progress.masteredIds.includes(k.id) && !progress.mistakeIds.includes(k.id));
      const mistakes = KANJI_DATA.filter(k => progress.mistakeIds.includes(k.id));
      
      // Mix: mostly unseen, some mistakes for reinforcement
      const batchSize = 10;
      queue = [...unseen.slice(0, batchSize)];
      if (queue.length < batchSize) {
        // Fill remaining with mistakes if we ran out of new cards
        queue = [...queue, ...mistakes.slice(0, batchSize - queue.length)];
      }
      // Shuffle
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
  };

  const handleOptionSelect = (selectedId: string) => {
    if (isAnswered) return;

    const currentCard = currentQueue[currentIndex];
    const isCorrect = selectedId === currentCard.id;
    
    setSelectedOptionId(selectedId);
    setIsAnswered(true);

    // Update Progress
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

    // Auto flip card to show details
    setTimeout(() => {
        setIsFlipped(true);
    }, 600);
  };

  const handleNextCard = () => {
    if (currentIndex < currentQueue.length - 1) {
      const nextIndex = currentIndex + 1;
      setCurrentIndex(nextIndex);
      setIsFlipped(false);
      setIsAnswered(false);
      setSelectedOptionId(null);
      generateOptions(currentQueue[nextIndex]);
    } else {
      setQuizFinished(true);
    }
  };

  const resetProgress = () => {
    if (confirm("Are you sure you want to reset all progress?")) {
      setProgress({
        masteredIds: [],
        mistakeIds: [],
        lastReviewDate: null
      });
    }
  };

  const currentCard = currentQueue[currentIndex];

  // -- RENDER HELPERS --

  const renderHome = () => (
    <div className="flex flex-col items-center justify-center min-h-[80vh] space-y-8 p-4">
      <div className="text-center space-y-2">
        <h1 className="text-4xl font-bold text-slate-800 tracking-wider">常用漢字</h1>
        <p className="text-slate-500">Joyo Kanji Mastery</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-md">
        <button 
          onClick={() => startQuiz(false)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white p-6 rounded-xl shadow-lg flex flex-col items-center transition-all transform hover:scale-105 active:scale-95"
        >
          <BookOpen className="w-8 h-8 mb-2" />
          <span className="font-bold text-lg">Start Learning</span>
          <span className="text-xs opacity-75 mt-1">New & Mixed Cards</span>
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
          <div className="bg-white p-8 rounded-2xl shadow-xl max-w-sm w-full">
            <h2 className="text-2xl font-bold text-slate-800 mb-4">Session Complete!</h2>
            <p className="text-slate-600 mb-8">You've reviewed {currentQueue.length} cards.</p>
            <button 
              onClick={() => setMode(AppMode.HOME)}
              className="w-full bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 transition-colors"
            >
              Back to Home
            </button>
          </div>
        </div>
      );
    }

    if (!currentCard) return <div>Loading...</div>;

    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] p-4 max-w-2xl mx-auto w-full">
        {/* Progress Header */}
        <div className="w-full flex justify-between items-center mb-4 text-slate-500 text-sm font-mono">
          <span>Card {currentIndex + 1} / {currentQueue.length}</span>
          <button onClick={() => setMode(AppMode.HOME)} className="hover:text-red-500"><X className="w-5 h-5" /></button>
        </div>

        {/* Card */}
        <div 
          className="relative w-full aspect-[16/9] md:aspect-[2/1] perspective-1000 mb-6 group cursor-pointer"
          onClick={() => setIsFlipped(!isFlipped)}
        >
          <div className={`relative w-full h-full transition-all duration-500 transform-style-3d shadow-xl rounded-2xl bg-white border border-slate-200 ${isFlipped ? 'rotate-y-180' : ''}`}>
            
            {/* Front */}
            <div className="absolute w-full h-full backface-hidden flex flex-col items-center justify-center p-4">
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
                    <p className="md:col-span-2 text-center text-slate-500 text-sm mb-2">Select the correct reading</p>
                     {quizOptions.map((opt) => (
                         <button
                            key={opt.id}
                            onClick={() => handleOptionSelect(opt.id)}
                            className="bg-white hover:bg-indigo-50 border-2 border-slate-200 hover:border-indigo-300 text-slate-700 p-4 rounded-xl shadow-sm transition-all text-left group"
                         >
                            <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-bold bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded">ON</span>
                                    <span className="font-medium">{opt.on.length > 0 ? opt.on.join('・') : '-'}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">KUN</span>
                                    <span className="font-medium">{opt.kun.length > 0 ? opt.kun.join('・') : '-'}</span>
                                </div>
                            </div>
                         </button>
                     ))}
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
                    className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-xl px-8 py-4 rounded-full font-bold text-lg flex items-center gap-2 transition-all transform hover:scale-105 active:scale-95 w-full max-w-sm justify-center"
                >
                    Next Question <ArrowRight className="w-5 h-5" />
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
                <button onClick={() => setMode(AppMode.HOME)} className="text-indigo-600 font-bold hover:underline whitespace-nowrap">Back</button>
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
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-blue-50">
      <nav className="p-4 flex justify-between items-center max-w-6xl mx-auto">
        <div className="font-bold text-indigo-900 flex items-center gap-2 cursor-pointer" onClick={() => setMode(AppMode.HOME)}>
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-serif">漢</div>
            JoyoMastery
        </div>
        {mode !== AppMode.HOME && (
            <button onClick={() => setMode(AppMode.HOME)} className="p-2 hover:bg-white/50 rounded-full transition-colors">
                <Home className="w-5 h-5 text-indigo-900" />
            </button>
        )}
      </nav>
      
      <main>
        {mode === AppMode.HOME && renderHome()}
        {mode === AppMode.QUIZ && renderQuiz()}
        {mode === AppMode.STATS && renderStats()}
      </main>
      
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