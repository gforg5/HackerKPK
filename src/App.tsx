import { useState, useEffect, createContext, useContext } from 'react';
import { GoogleGenAI } from '@google/genai';
import { HashRouter as Router, Routes, Route, Navigate, Link, useNavigate, useParams } from 'react-router-dom';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut, User } from 'firebase/auth';
import { doc, getDoc, getDocs, setDoc, onSnapshot, collection, query, where, orderBy, deleteDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, db, storage, handleFirestoreError, OperationType } from './firebase';
import { UserProfile, Course, Lesson, UserStatus, UserProgress, Badge, Certificate } from './types';
import { Shield, Book, Users, LogOut, Lock, Terminal, User as UserIcon, Plus, Trash, Edit, ChevronRight, FileText, ExternalLink, Award, Medal, Download, Printer, CheckCircle, Star, Sparkles, Bot, Send, Loader2, Menu, X, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Toaster, toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend } from 'recharts';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// --- Utils ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Auth Context ---
interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  isTeacher: boolean;
  isApprovedStudent: boolean;
  signIn: (role: 'student' | 'teacher') => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;
    const unsubscribeAuth = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const docRef = doc(db, 'users', u.uid);
        unsubscribeProfile = onSnapshot(docRef, (docSnap) => {
          if (docSnap.exists()) {
            setProfile(docSnap.data() as UserProfile);
          } else {
            setProfile(null);
          }
          setLoading(false);
        }, (error) => {
          handleFirestoreError(error, OperationType.GET, `users/${u.uid}`);
          setLoading(false);
        });
      } else {
        if (unsubscribeProfile) unsubscribeProfile();
        setProfile(null);
        setLoading(false);
      }
    });
    return () => {
      unsubscribeAuth();
      if (unsubscribeProfile) unsubscribeProfile();
    };
  }, []);

  const signIn = async (role: 'student' | 'teacher') => {
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      const u = result.user;
      const docRef = doc(db, 'users', u.uid);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        const newProfile: UserProfile = {
          uid: u.uid,
          email: u.email!,
          role: u.email === 'goodforg555@gmail.com' ? 'admin' : role,
          status: u.email === 'goodforg555@gmail.com' ? 'approved' : 'pending',
          displayName: u.displayName || '',
          photoURL: u.photoURL || '',
        };
        await setDoc(docRef, newProfile);
        setProfile(newProfile);
      }
    } catch (error) {
      toast.error("Authentication failed");
      console.error(error);
    }
  };

  const logout = async () => {
    await signOut(auth);
  };

  const isAdmin = profile?.role === 'admin' || profile?.email === 'goodforg555@gmail.com';
  const isTeacher = profile?.role === 'teacher';
  const isApprovedStudent = profile?.role === 'student' && profile?.status === 'approved';

  return (
    <AuthContext.Provider value={{ user, profile, loading, isAdmin, isTeacher, isApprovedStudent, signIn, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

// --- Components ---

function ProtectedRoute({ children, allowedRoles }: { children: React.ReactNode, allowedRoles?: string[] }) {
  const { user, profile, loading, isAdmin } = useAuth();
  if (loading) return <div className="min-h-screen bg-black flex items-center justify-center text-green-500 font-mono">INITIALIZING_SYSTEM...</div>;
  if (!user) return <Navigate to="/login" />;
  if (allowedRoles && profile && !allowedRoles.includes(profile.role) && !isAdmin) return <Navigate to="/" />;
  return <>{children}</>;
}

function Navbar() {
  const { profile, logout, isAdmin, isTeacher, isApprovedStudent } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [courses, setCourses] = useState<Course[]>([]);
  const [searchResults, setSearchResults] = useState<Course[]>([]);
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'courses'), (snapshot) => {
      setCourses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Course)));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'courses');
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (searchQuery.trim() === '') {
      setSearchResults([]);
      return;
    }
    const filtered = courses.filter(course => 
      course.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      course.description.toLowerCase().includes(searchQuery.toLowerCase())
    );
    setSearchResults(filtered.slice(0, 5));
  }, [searchQuery, courses]);

  const navLinks = [
    { to: "/courses", label: "Courses" },
    { to: "/developer", label: "Developer" },
  ];

  if (isApprovedStudent || isAdmin || isTeacher) navLinks.splice(0, 0, { to: "/dashboard", label: "Dashboard" });
  if (isAdmin) navLinks.splice(2, 0, { to: "/admin", label: "Admin" });
  if (isTeacher) navLinks.splice(2, 0, { to: "/teacher", label: "Teacher" });

  return (
    <nav className="bg-black border-b border-green-900/30 px-4 md:px-6 py-4 flex items-center justify-between sticky top-0 z-50 backdrop-blur-md">
      <div className="flex items-center gap-4 md:gap-8 flex-1">
        <Link to="/" className="flex items-center gap-2 text-green-500 font-bold text-lg md:text-xl tracking-tighter z-50 shrink-0">
          <Shield className="w-5 h-5 md:w-6 md:h-6" />
          HACKER KPK
        </Link>
      </div>

      {/* Desktop Navigation */}
      <div className="hidden md:flex items-center gap-6">
        {navLinks.map((link) => (
          <motion.div key={link.to} whileHover={{ y: -2 }} transition={{ type: "spring", stiffness: 400 }}>
            <Link to={link.to} className="text-gray-400 hover:text-green-400 transition-colors text-sm font-mono uppercase tracking-widest">{link.label}</Link>
          </motion.div>
        ))}
        {profile && (
          <motion.div whileHover={{ y: -2 }} transition={{ type: "spring", stiffness: 400 }}>
            <Link to="/profile" className="text-gray-400 hover:text-green-400 transition-colors text-sm font-mono uppercase tracking-widest flex items-center gap-2">
              <UserIcon className="w-4 h-4" />
              Profile
            </Link>
          </motion.div>
        )}
        {profile ? (
          <motion.button 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={logout} 
            className="flex items-center gap-2 text-red-500/80 hover:text-red-500 transition-colors text-sm font-mono uppercase tracking-widest"
          >
            <LogOut className="w-4 h-4" />
            Exit
          </motion.button>
        ) : (
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Link to="/login" className="bg-green-600 text-black px-6 py-2 rounded-full font-black text-sm hover:bg-green-500 transition-all shadow-[0_0_15px_rgba(34,197,94,0.3)]">LOGIN</Link>
          </motion.div>
        )}
      </div>

      {/* Mobile Menu Toggle */}
      <button 
        className="md:hidden text-green-500 z-50 p-2"
        onClick={() => setIsMenuOpen(!isMenuOpen)}
      >
        {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
      </button>

      {/* Mobile Navigation Overlay */}
      <AnimatePresence>
        {isMenuOpen && (
          <motion.div
            initial={{ opacity: 0, x: "100%" }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed inset-0 bg-black z-40 flex flex-col items-center justify-center gap-6 p-6 md:hidden"
          >
            {/* Mobile Search */}
            <div className="w-full max-w-xs relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-green-900" />
              <input 
                type="text"
                placeholder="SEARCH..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-zinc-950 border border-green-900/30 rounded-full py-3 pl-10 pr-4 text-sm font-mono text-green-500 focus:outline-none focus:border-green-500 transition-all placeholder:text-green-900/50"
              />
              {searchQuery && searchResults.length > 0 && (
                <div className="absolute top-full left-0 w-full mt-2 bg-zinc-950 border border-green-900/50 rounded-lg shadow-2xl overflow-hidden max-h-[200px] overflow-y-auto z-50">
                  {searchResults.map((course) => (
                    <Link 
                      key={course.id}
                      to={`/course/${course.id}`}
                      onClick={() => { setIsMenuOpen(false); setSearchQuery(''); }}
                      className="flex items-center gap-3 p-3 hover:bg-green-900/10 transition-colors border-b border-green-900/10 last:border-0"
                    >
                      <div className="text-xs font-bold text-green-500 uppercase truncate">{course.title}</div>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {navLinks.map((link) => (
              <Link 
                key={link.to}
                to={link.to} 
                onClick={() => setIsMenuOpen(false)}
                className="text-2xl text-gray-400 hover:text-green-500 font-mono uppercase tracking-[0.3em]"
              >
                {link.label}
              </Link>
            ))}
            {profile && (
              <Link 
                to="/profile" 
                onClick={() => setIsMenuOpen(false)}
                className="text-2xl text-gray-400 hover:text-green-500 font-mono uppercase tracking-[0.3em] flex items-center gap-3"
              >
                <UserIcon className="w-6 h-6" />
                Profile
              </Link>
            )}
            {profile ? (
              <button 
                onClick={() => { logout(); setIsMenuOpen(false); }}
                className="text-2xl text-red-500/80 hover:text-red-500 font-mono uppercase tracking-[0.3em] flex items-center gap-3"
              >
                <LogOut className="w-6 h-6" />
                Exit
              </button>
            ) : (
              <Link 
                to="/login" 
                onClick={() => setIsMenuOpen(false)}
                className="bg-green-600 text-black px-12 py-4 rounded-full font-black text-xl hover:bg-green-500 transition-all shadow-[0_0_20px_rgba(34,197,94,0.3)]"
              >
                LOGIN
              </Link>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}

// --- AI Tutor ---

function AITutor({ courseTitle, lessonTitle, lessonContent }: { courseTitle: string, lessonTitle: string, lessonContent: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<{ role: 'user' | 'model', text: string }[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  const sendMessage = async () => {
    if (!input.trim() || isTyping) return;

    const userMessage = { role: 'user' as const, text: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsTyping(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      const model = ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [
          ...messages.map(m => ({ role: m.role, parts: [{ text: m.text }] })),
          { role: 'user', parts: [{ text: input }] }
        ],
        config: {
          systemInstruction: `You are an elite cybersecurity tutor for the Hacker KPK platform. 
          The student is currently studying the course "${courseTitle}" and the lesson "${lessonTitle}".
          Lesson Content: ${lessonContent}
          
          Provide clear, technical, but accessible explanations. 
          Focus on ethical hacking, security best practices, and defensive strategies.
          Keep your responses concise and formatted in Markdown.
          If the student asks something unrelated to cybersecurity or the course, politely redirect them.`,
        }
      });

      const response = await model;
      const aiMessage = { role: 'model' as const, text: response.text || 'SYSTEM_ERROR: NO_RESPONSE_RECEIVED' };
      setMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      console.error("AI Error:", error);
      toast.error("AI_COMMUNICATION_FAILURE");
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-[60] font-mono">
      <AnimatePresence>
        {isOpen && (
            <motion.div 
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="bg-zinc-900 border border-green-900/50 w-[calc(100vw-48px)] sm:w-[350px] md:w-[400px] h-[500px] rounded-lg shadow-2xl flex flex-col overflow-hidden mb-4"
          >
            {/* Header */}
            <div className="bg-green-900/20 p-4 border-b border-green-900/30 flex items-center justify-between">
              <div className="flex items-center gap-2 text-green-500">
                <Bot className="w-5 h-5" />
                <span className="font-black text-sm uppercase tracking-widest">AI_TUTOR_v1.0</span>
              </div>
              <button onClick={() => setIsOpen(false)} className="text-gray-500 hover:text-white transition-colors">
                <ChevronRight className="w-5 h-5 rotate-90" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-green-900/50">
              {messages.length === 0 && (
                <div className="text-center py-8 space-y-2">
                  <Sparkles className="w-8 h-8 text-green-500/30 mx-auto" />
                  <p className="text-gray-500 text-xs uppercase tracking-widest">Awaiting input... Ask me anything about this lesson.</p>
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} className={cn(
                  "flex flex-col max-w-[85%] space-y-1",
                  m.role === 'user' ? "ml-auto items-end" : "items-start"
                )}>
                  <span className="text-[10px] text-gray-500 uppercase font-bold">
                    {m.role === 'user' ? 'STUDENT' : 'AI_TUTOR'}
                  </span>
                  <div className={cn(
                    "p-3 rounded-sm text-sm leading-relaxed",
                    m.role === 'user' ? "bg-green-600 text-black" : "bg-zinc-800 text-gray-300 border border-green-900/20"
                  )}>
                    <div className="prose prose-invert prose-sm max-w-none">
                      <ReactMarkdown>
                        {m.text}
                      </ReactMarkdown>
                    </div>
                  </div>
                </div>
              ))}
              {isTyping && (
                <div className="flex items-center gap-2 text-green-500/50 text-xs animate-pulse">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  PROCESSING_QUERY...
                </div>
              )}
            </div>

            {/* Input */}
            <div className="p-4 border-t border-green-900/30 bg-black/50">
              <form 
                onSubmit={(e) => { e.preventDefault(); sendMessage(); }}
                className="flex gap-2"
              >
                <input 
                  type="text" 
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="ASK_A_QUESTION..."
                  className="flex-1 bg-zinc-800 border border-green-900/30 rounded-sm px-3 py-2 text-sm text-white focus:outline-none focus:border-green-500 transition-colors placeholder:text-gray-600"
                />
                <button 
                  type="submit"
                  disabled={isTyping || !input.trim()}
                  className="bg-green-600 text-black p-2 rounded-sm hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button 
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-all duration-300",
          isOpen ? "bg-red-600 text-white rotate-90" : "bg-green-600 text-black"
        )}
      >
        {isOpen ? <Plus className="w-6 h-6 rotate-45" /> : <Bot className="w-6 h-6" />}
      </motion.button>
    </div>
  );
}

// --- Pages ---

function Home() {
  const { profile } = useAuth();
  return (
    <div className="flex-1 bg-black text-white flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(0,255,0,0.05),transparent_70%)] pointer-events-none" />
      
      {/* Background Image with Animation */}
      <motion.div 
        initial={{ opacity: 0, scale: 1.2 }}
        animate={{ opacity: 0.15, scale: 1 }}
        transition={{ duration: 2, ease: "easeOut" }}
        className="absolute inset-0 z-0 flex items-center justify-center pointer-events-none"
      >
        <img 
          src="https://ais-pre-v2zwxlezirej4nltubfncf-282611516263.asia-east1.run.app/api/attachments/1742896582494_image.png" 
          alt="Background" 
          className="w-full h-full object-cover grayscale brightness-50"
          referrerPolicy="no-referrer"
        />
      </motion.div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="max-w-3xl text-center space-y-8 relative z-10"
      >
        <motion.h1 
          initial={{ letterSpacing: "0.5em", opacity: 0 }}
          animate={{ letterSpacing: "0em", opacity: 1 }}
          transition={{ duration: 1, delay: 0.2 }}
          className="text-5xl sm:text-6xl md:text-8xl font-black tracking-tighter leading-none text-green-500 relative"
        >
          <span className="relative z-10">HACKER<br/>KPK</span>
          <motion.span 
            animate={{ x: [-2, 2, -2], opacity: [0, 0.5, 0] }}
            transition={{ duration: 0.2, repeat: Infinity, repeatType: "reverse" }}
            className="absolute inset-0 text-red-500 z-0 translate-x-1"
          >
            HACKER<br/>KPK
          </motion.span>
          <motion.span 
            animate={{ x: [2, -2, 2], opacity: [0, 0.5, 0] }}
            transition={{ duration: 0.2, repeat: Infinity, repeatType: "reverse", delay: 0.1 }}
            className="absolute inset-0 text-blue-500 z-0 -translate-x-1"
          >
            HACKER<br/>KPK
          </motion.span>
        </motion.h1>
        <motion.p 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 0.5 }}
          className="text-gray-400 text-lg md:text-xl font-mono max-w-2xl mx-auto leading-relaxed"
        >
          The ultimate training ground for cyber ethical hackers and cyber hunters' legal security professionals. Expert-led courses, real-world scenarios, and a community of elite hackers.
        </motion.p>
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.8 }}
          className="flex flex-wrap justify-center gap-4"
        >
          <Link to="/courses" className="bg-green-600 text-black px-8 py-4 rounded-full font-black text-lg hover:bg-green-500 transition-all transform hover:scale-105 shadow-[0_0_20px_rgba(34,197,94,0.3)]">
            START_LEARNING
          </Link>
          <Link to="/developer" className="border border-green-900/50 text-green-500 px-8 py-4 rounded-full font-black text-lg hover:bg-green-900/20 transition-all">
            MEET_THE_SMA
          </Link>
        </motion.div>
        {profile?.status === 'pending' && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mt-12 p-4 bg-yellow-900/20 border border-yellow-900/50 rounded-sm text-yellow-500 font-mono text-sm"
          >
            ACCESS_STATUS: PENDING_APPROVAL. PLEASE WAIT FOR ADMIN AUTHORIZATION.
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}

function Login() {
  const { signIn, user, profile } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user && profile) navigate('/');
  }, [user, profile, navigate]);

  return (
    <div className="flex-1 bg-black flex items-center justify-center p-4 sm:p-6 font-mono">
      <div className="max-w-md w-full space-y-8 bg-zinc-950 border border-green-900/30 p-6 sm:p-10 rounded-sm shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-green-500" />
        <div className="text-center space-y-2">
          <Shield className="w-12 h-12 text-green-500 mx-auto mb-4" />
          <h2 className="text-3xl font-black text-white tracking-tighter uppercase">Authentication</h2>
          <p className="text-gray-500 text-sm">SECURE_GATEWAY_V2.0</p>
        </div>
        <div className="space-y-4">
          <button 
            onClick={() => signIn('student')}
            className="w-full flex items-center justify-center gap-3 bg-white text-black py-3 rounded-full font-bold hover:bg-gray-200 transition-colors"
          >
            <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="" />
            CONTINUE_AS_STUDENT
          </button>
          <button 
            onClick={() => signIn('teacher')}
            className="w-full flex items-center justify-center gap-3 border border-green-900/50 text-green-500 py-3 rounded-full font-bold hover:bg-green-900/10 transition-colors"
          >
            CONTINUE_AS_TEACHER
          </button>
        </div>
        <p className="text-center text-xs text-gray-600 mt-8">
          BY ACCESSING THIS SYSTEM YOU AGREE TO ALL OPERATIONAL PROTOCOLS.
        </p>
      </div>
    </div>
  );
}

function Developer() {
  return (
    <div className="flex-1 bg-black text-white p-6 md:p-12 font-mono selection:bg-green-500 selection:text-black">
      <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-12 items-center">
        <motion.div 
          initial={{ opacity: 0, x: -50 }}
          animate={{ opacity: 1, x: 0 }}
          className="space-y-8"
        >
          <div className="space-y-2">
            <span className="text-green-500 text-xs md:text-sm tracking-[0.5em] uppercase">Developer</span>
            <h1 className="text-5xl sm:text-6xl md:text-8xl font-black tracking-tighter leading-none">
              SAYED<br/>MOHSIN<br/>ALI
            </h1>
          </div>
          <div className="space-y-4 text-gray-400 text-lg leading-relaxed">
            <p className="border-l-4 border-green-500 pl-6">
              Systems Developer & Security Specialist. Crafting advanced digital infrastructures with a focus on performance, security, and elite user experiences.
            </p>
            <p>
              Architect of the Hacker KPK ecosystem. Dedicated to empowering cyber ethical hackers and cyber hunters' legal security professionals through cutting-edge technology and knowledge sharing.
            </p>
          </div>
          <div className="flex gap-4">
            <motion.div 
              whileHover={{ scale: 1.05, borderColor: '#22c55e' }}
              className="p-4 bg-zinc-900/50 border border-green-900/30 rounded-full transition-colors px-8"
            >
              <span className="block text-green-500 text-xs uppercase mb-1">Experience</span>
              <span className="text-xl font-bold">CSe</span>
            </motion.div>
            <motion.div 
              whileHover={{ scale: 1.05, borderColor: '#22c55e' }}
              className="p-4 bg-zinc-900/50 border border-green-900/30 rounded-full transition-colors px-8"
            >
              <span className="block text-green-500 text-xs uppercase mb-1">Specialization</span>
              <span className="text-xl font-bold">DEVELOPER</span>
            </motion.div>
          </div>
        </motion.div>
        
        <motion.div 
          initial={{ opacity: 0, scale: 0.9, rotate: -5 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          transition={{ duration: 1, type: "spring" }}
          className="relative group"
        >
          <div className="absolute -inset-4 bg-green-500/20 blur-2xl group-hover:bg-green-500/40 transition-all duration-500 animate-pulse" />
          <motion.div 
            whileHover={{ 
              skewX: [-1, 1, -1, 0],
              x: [-2, 2, -2, 0],
              filter: ["hue-rotate(0deg)", "hue-rotate(90deg)", "hue-rotate(-90deg)", "hue-rotate(0deg)"]
            }}
            transition={{ duration: 0.2, repeat: Infinity }}
            className="relative w-64 h-64 md:w-80 md:h-80 mx-auto overflow-hidden border-4 border-green-500 rounded-full grayscale hover:grayscale-0 transition-all duration-700 shadow-[0_0_50px_rgba(34,197,94,0.3)]"
          >
            <img 
              src="https://raw.githubusercontent.com/gforg5/Nano-Lens/refs/heads/main/1769069098374.png" 
              alt="Sayed Mohsin Ali" 
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-60" />
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-center">
              <motion.div 
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="text-green-500 text-[8px] mb-1 tracking-widest"
              >
                ENCRYPTED_ID
              </motion.div>
              <div className="text-xl font-black tracking-tighter">DEV_05</div>
            </div>
            
            {/* Animated scanline */}
            <motion.div 
              animate={{ top: ["-100%", "100%"] }}
              transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
              className="absolute left-0 w-full h-1 bg-green-500/20 z-20 pointer-events-none"
            />
          </motion.div>
          {/* Decorative elements */}
          <motion.div 
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 3, repeat: Infinity }}
            className="absolute top-0 right-0 w-12 h-12 border-t-2 border-r-2 border-green-500 rounded-tr-xl" 
          />
          <motion.div 
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 3, repeat: Infinity, delay: 1.5 }}
            className="absolute bottom-0 left-0 w-12 h-12 border-b-2 border-l-2 border-green-500" 
          />
        </motion.div>
      </div>
    </div>
  );
}

function Admin() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'users' | 'courses'>('users');

  useEffect(() => {
    const qUsers = query(collection(db, 'users'), orderBy('email'));
    const unsubscribeUsers = onSnapshot(qUsers, (snapshot) => {
      setUsers(snapshot.docs.map(doc => doc.data() as UserProfile));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'users'));

    const qCourses = query(collection(db, 'courses'), orderBy('title'));
    const unsubscribeCourses = onSnapshot(qCourses, (snapshot) => {
      setCourses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Course)));
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'courses'));

    return () => {
      unsubscribeUsers();
      unsubscribeCourses();
    };
  }, []);

  const toggleStatus = async (uid: string, currentStatus: UserStatus) => {
    const newStatus = currentStatus === 'approved' ? 'pending' : 'approved';
    try {
      await setDoc(doc(db, 'users', uid), { status: newStatus }, { merge: true });
      toast.success(`User ${newStatus}`);
    } catch (error) {
      toast.error("Failed to update status");
    }
  };

  const setPassword = async (uid: string) => {
    const password = prompt("Enter unique access password for this student:");
    if (!password) return;
    try {
      await setDoc(doc(db, 'users', uid), { accessPassword: password }, { merge: true });
      toast.success("Password set successfully");
    } catch (error) {
      toast.error("Failed to set password");
    }
  };

  const updateRole = async (uid: string, newRole: 'admin' | 'teacher' | 'student') => {
    try {
      await setDoc(doc(db, 'users', uid), { role: newRole }, { merge: true });
      toast.success(`Role updated to ${newRole}`);
    } catch (error) {
      toast.error("Failed to update role");
    }
  };

  const deleteCourse = async (courseId: string) => {
    if (!confirm("CRITICAL_ACTION: Are you sure you want to delete this entire course? This action cannot be undone and will remove all associated lessons.")) return;
    try {
      await deleteDoc(doc(db, 'courses', courseId));
      toast.success("Course deleted successfully");
    } catch (error) {
      toast.error("Failed to delete course");
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-8 font-mono">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl md:text-3xl font-black text-green-500 tracking-tighter uppercase">System Administration</h1>
        <div className="text-[10px] md:text-xs text-gray-500 uppercase">SYSTEM_ADMIN_PANEL_V2</div>
      </div>

      <div className="flex overflow-x-auto gap-4 border-b border-green-900/30 pb-4 scrollbar-none">
        <button 
          onClick={() => setActiveTab('users')}
          className={cn(
            "px-4 py-2 text-[10px] md:text-xs font-bold uppercase tracking-widest transition-all whitespace-nowrap",
            activeTab === 'users' ? "text-green-500 border-b-2 border-green-500" : "text-gray-500 hover:text-gray-300"
          )}
        >
          User Management
        </button>
        <button 
          onClick={() => setActiveTab('courses')}
          className={cn(
            "px-4 py-2 text-[10px] md:text-xs font-bold uppercase tracking-widest transition-all whitespace-nowrap",
            activeTab === 'courses' ? "text-green-500 border-b-2 border-green-500" : "text-gray-500 hover:text-gray-300"
          )}
        >
          Course Management
        </button>
      </div>

      {activeTab === 'users' ? (
        <div className="bg-zinc-950 border border-green-900/30 overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[600px]">
            <thead>
              <tr className="bg-zinc-900 border-b border-green-900/30">
                <th className="p-4 text-green-500 text-xs uppercase tracking-widest">User</th>
                <th className="p-4 text-green-500 text-xs uppercase tracking-widest">Role</th>
                <th className="p-4 text-green-500 text-xs uppercase tracking-widest">Status</th>
                <th className="p-4 text-green-500 text-xs uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-green-900/10">
              {users.map(u => (
                <tr key={u.uid} className="hover:bg-green-900/5 transition-colors">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <img src={u.photoURL} className="w-8 h-8 rounded-full border border-green-900/30" alt="" referrerPolicy="no-referrer" />
                      <div>
                        <div className="text-white font-bold">{u.displayName}</div>
                        <div className="text-gray-500 text-xs italic">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="p-4">
                    <select 
                      value={u.role}
                      onChange={(e) => updateRole(u.uid, e.target.value as any)}
                      className={cn(
                        "bg-zinc-900 border border-green-900/30 rounded-sm text-[10px] font-bold uppercase px-2 py-1 focus:outline-none focus:border-green-500 transition-colors cursor-pointer",
                        u.role === 'admin' ? "text-red-500" : 
                        u.role === 'teacher' ? "text-blue-500" : 
                        "text-green-500"
                      )}
                    >
                      <option value="student">Student</option>
                      <option value="teacher">Teacher</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td className="p-4">
                    <span className={cn(
                      "px-2 py-0.5 rounded-sm text-[10px] font-bold uppercase",
                      u.status === 'approved' ? "bg-green-500 text-black" : "bg-yellow-900/20 text-yellow-500"
                    )}>
                      {u.status}
                    </span>
                  </td>
                  <td className="p-4 text-right space-x-2">
                    {u.role === 'student' && (
                      <button 
                        onClick={() => setPassword(u.uid)}
                        className="text-gray-400 hover:text-white p-1"
                        title="Set Access Password"
                      >
                        <Lock className="w-4 h-4" />
                      </button>
                    )}
                    <button 
                      onClick={() => toggleStatus(u.uid, u.status)}
                      className={cn(
                        "px-3 py-1 rounded-sm text-xs font-bold transition-colors",
                        u.status === 'approved' ? "bg-red-900/20 text-red-500 hover:bg-red-900/40" : "bg-green-900/20 text-green-500 hover:bg-green-900/40"
                      )}
                    >
                      {u.status === 'approved' ? 'REVOKE' : 'APPROVE'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-zinc-950 border border-green-900/30 overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[600px]">
            <thead>
              <tr className="bg-zinc-900 border-b border-green-900/30">
                <th className="p-4 text-green-500 text-xs uppercase tracking-widest">Course Title</th>
                <th className="p-4 text-green-500 text-xs uppercase tracking-widest">Teacher ID</th>
                <th className="p-4 text-green-500 text-xs uppercase tracking-widest">Category</th>
                <th className="p-4 text-green-500 text-xs uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-green-900/10">
              {courses.map(c => (
                <tr key={c.id} className="hover:bg-green-900/5 transition-colors">
                  <td className="p-4">
                    <div className="text-white font-bold">{c.title}</div>
                    <div className="text-gray-500 text-[10px] uppercase">{c.id}</div>
                  </td>
                  <td className="p-4">
                    <div className="text-gray-400 text-xs font-mono">{c.teacherId}</div>
                  </td>
                  <td className="p-4">
                    <span className="px-2 py-0.5 bg-green-900/20 text-green-500 rounded-sm text-[10px] font-bold uppercase">
                      {c.category}
                    </span>
                  </td>
                  <td className="p-4 text-right space-x-2">
                    <Link 
                      to={`/course/${c.id}`}
                      className="inline-flex items-center justify-center p-2 text-gray-400 hover:text-green-500 transition-colors"
                      title="View Course"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </Link>
                    <Link 
                      to={`/teacher/course/${c.id}`}
                      className="inline-flex items-center justify-center p-2 text-gray-400 hover:text-blue-500 transition-colors"
                      title="Edit Course"
                    >
                      <Edit className="w-4 h-4" />
                    </Link>
                    <button 
                      onClick={() => deleteCourse(c.id)}
                      className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                      title="Delete Course"
                    >
                      <Trash className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {courses.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-12 text-center text-gray-600 uppercase tracking-widest text-xs">
                    NO_COURSES_FOUND_IN_DATABASE
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Teacher() {
  const { user } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [newCourse, setNewCourse] = useState({ title: '', description: '', thumbnailUrl: '', category: 'General', difficulty: 'Beginner' as 'Beginner' | 'Intermediate' | 'Advanced' });
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'courses'>('dashboard');
  const [progressData, setProgressData] = useState<UserProgress[]>([]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'courses'), where('teacherId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setCourses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Course)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'courses'));
    return unsubscribe;
  }, [user]);

  useEffect(() => {
    if (courses.length === 0) return;
    const courseIds = courses.map(c => c.id);
    // Firestore 'in' queries support up to 10 items. For simplicity, we fetch all progress and filter locally if there are many courses.
    // However, a better approach for large scale is to fetch progress per course or use cloud functions.
    // Here we'll just fetch all progress and filter locally to ensure we get all data regardless of course count.
    const q = query(collection(db, 'progress'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allProgress = snapshot.docs.map(doc => doc.data() as UserProgress);
      setProgressData(allProgress.filter(p => courseIds.includes(p.courseId)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'progress'));
    return unsubscribe;
  }, [courses]);

  const totalEnrollments = progressData.length;
  const averageProgress = totalEnrollments > 0 
    ? Math.round(progressData.reduce((acc, curr) => acc + (curr.completionPercentage || 0), 0) / totalEnrollments)
    : 0;

  const addCourse = async () => {
    if (!newCourse.title || !user) return;
    const id = Math.random().toString(36).substr(2, 9);
    setIsUploading(true);
    
    let finalThumbnailUrl = newCourse.thumbnailUrl;

    try {
      if (thumbnailFile) {
        const storageRef = ref(storage, `course_thumbnails/${id}/${thumbnailFile.name}`);
        const snapshot = await uploadBytes(storageRef, thumbnailFile);
        finalThumbnailUrl = await getDownloadURL(snapshot.ref);
      }

      await setDoc(doc(db, 'courses', id), {
        ...newCourse,
        thumbnailUrl: finalThumbnailUrl,
        id,
        teacherId: user.uid,
        createdAt: new Date(),
      });
      setIsAdding(false);
      setNewCourse({ title: '', description: '', thumbnailUrl: '', category: 'General', difficulty: 'Beginner' });
      setThumbnailFile(null);
      toast.success("Course created");
    } catch (error) {
      console.error("Error adding course:", error);
      toast.error("Failed to create course");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8 font-mono">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-black text-green-500 tracking-tighter uppercase">Teacher Portal</h1>
        <button 
          onClick={() => setIsAdding(true)}
          className="bg-green-600 text-black px-4 py-2 rounded-sm font-bold text-sm hover:bg-green-500 flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> NEW_COURSE
        </button>
      </div>

      <div className="flex gap-4 border-b border-green-900/30 pb-4">
        <button 
          onClick={() => setActiveTab('dashboard')}
          className={cn(
            "px-4 py-2 text-xs font-bold uppercase tracking-widest transition-all",
            activeTab === 'dashboard' ? "text-green-500 border-b-2 border-green-500" : "text-gray-500 hover:text-gray-300"
          )}
        >
          Dashboard
        </button>
        <button 
          onClick={() => setActiveTab('courses')}
          className={cn(
            "px-4 py-2 text-xs font-bold uppercase tracking-widest transition-all",
            activeTab === 'courses' ? "text-green-500 border-b-2 border-green-500" : "text-gray-500 hover:text-gray-300"
          )}
        >
          My Courses
        </button>
      </div>

      {activeTab === 'dashboard' ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-zinc-950 border border-green-900/30 p-6 rounded-sm space-y-2">
              <div className="text-gray-500 text-[10px] uppercase tracking-widest font-bold flex items-center gap-2">
                <Book className="w-4 h-4 text-green-500" /> Active Modules
              </div>
              <div className="text-4xl font-black text-white">{courses.length}</div>
            </div>
            <div className="bg-zinc-950 border border-green-900/30 p-6 rounded-sm space-y-2">
              <div className="text-gray-500 text-[10px] uppercase tracking-widest font-bold flex items-center gap-2">
                <Users className="w-4 h-4 text-green-500" /> Total Enrollments
              </div>
              <div className="text-4xl font-black text-white">{totalEnrollments}</div>
            </div>
            <div className="bg-zinc-950 border border-green-900/30 p-6 rounded-sm space-y-2">
              <div className="text-gray-500 text-[10px] uppercase tracking-widest font-bold flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-500" /> Avg. Completion
              </div>
              <div className="text-4xl font-black text-white">{averageProgress}%</div>
            </div>
          </div>

          <div className="bg-zinc-950 border border-green-900/30 rounded-sm overflow-hidden p-6">
            <h3 className="text-xs font-bold text-green-500 uppercase tracking-widest mb-6">Course Performance Overview</h3>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={courses.map(c => {
                  const courseProgress = progressData.filter(p => p.courseId === c.id);
                  return {
                    name: c.title.length > 15 ? c.title.substring(0, 15) + '...' : c.title,
                    enrollments: courseProgress.length,
                    avgProgress: courseProgress.length > 0 
                      ? Math.round(courseProgress.reduce((acc, curr) => acc + (curr.completionPercentage || 0), 0) / courseProgress.length)
                      : 0
                  };
                })}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a2e1a" vertical={false} />
                  <XAxis 
                    dataKey="name" 
                    stroke="#4a4a4a" 
                    fontSize={10} 
                    tickLine={false} 
                    axisLine={false}
                  />
                  <YAxis 
                    stroke="#4a4a4a" 
                    fontSize={10} 
                    tickLine={false} 
                    axisLine={false}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#09090b', border: '1px solid #14532d', borderRadius: '4px' }}
                    itemStyle={{ fontSize: '12px', fontFamily: 'monospace' }}
                    cursor={{ fill: '#14532d', opacity: 0.1 }}
                  />
                  <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '20px' }} />
                  <Bar dataKey="enrollments" fill="#22c55e" radius={[2, 2, 0, 0]} name="Enrollments" />
                  <Bar dataKey="avgProgress" fill="#14532d" radius={[2, 2, 0, 0]} name="Avg. Progress (%)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-zinc-950 border border-green-900/30 rounded-sm overflow-hidden">
            <div className="p-4 border-b border-green-900/30 bg-zinc-900/50">
              <h3 className="text-xs font-bold text-green-500 uppercase tracking-widest">Course Performance</h3>
            </div>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-zinc-900/80 border-b border-green-900/30">
                  <th className="p-4 text-gray-500 text-[10px] uppercase tracking-widest">Course</th>
                  <th className="p-4 text-gray-500 text-[10px] uppercase tracking-widest text-right">Enrollments</th>
                  <th className="p-4 text-gray-500 text-[10px] uppercase tracking-widest text-right">Avg. Progress</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-green-900/10">
                {courses.map(course => {
                  const courseProgress = progressData.filter(p => p.courseId === course.id);
                  const enrollments = courseProgress.length;
                  const avgProg = enrollments > 0 
                    ? Math.round(courseProgress.reduce((acc, curr) => acc + (curr.completionPercentage || 0), 0) / enrollments)
                    : 0;
                  return (
                    <tr key={course.id} className="hover:bg-green-900/5 transition-colors">
                      <td className="p-4">
                        <div className="text-sm font-bold text-white">{course.title}</div>
                        <div className="text-[10px] text-gray-500 uppercase">{course.category}</div>
                      </td>
                      <td className="p-4 text-right font-mono text-sm text-gray-300">{enrollments}</td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <span className="font-mono text-sm text-green-500">{avgProg}%</span>
                          <div className="w-16 h-1.5 bg-green-900/20 rounded-full overflow-hidden">
                            <div className="h-full bg-green-500" style={{ width: `${avgProg}%` }} />
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {courses.length === 0 && (
                  <tr>
                    <td colSpan={3} className="p-8 text-center text-gray-600 text-xs uppercase tracking-widest">No courses deployed yet</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid md:grid-cols-3 gap-6">
          {courses.map(c => (
            <Link key={c.id} to={`/teacher/course/${c.id}`} className="bg-zinc-950 border border-green-900/30 overflow-hidden rounded-sm hover:border-green-500 transition-all group">
              <div className="aspect-video bg-zinc-900 relative overflow-hidden">
                {c.thumbnailUrl ? (
                  <img src={c.thumbnailUrl} alt={c.title} className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity" referrerPolicy="no-referrer" />
                ) : (
                  <Terminal className="absolute inset-0 m-auto w-8 h-8 text-green-900/50 group-hover:text-green-500 transition-colors" />
                )}
              </div>
              <div className="p-6">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xl font-bold text-white group-hover:text-green-400">{c.title}</h3>
                  <span className={cn(
                    "text-[8px] px-2 py-0.5 rounded-full border uppercase font-bold",
                    c.difficulty === 'Beginner' ? "border-green-500 text-green-500" :
                    c.difficulty === 'Intermediate' ? "border-yellow-500 text-yellow-500" :
                    "border-red-500 text-red-500"
                  )}>
                    {c.difficulty || 'Beginner'}
                  </span>
                </div>
                <p className="text-gray-500 text-sm line-clamp-2 mb-4">{c.description}</p>
                <div className="flex items-center justify-between text-[10px] text-gray-600 uppercase tracking-widest">
                  <span>ID: {c.id}</span>
                  <ChevronRight className="w-4 h-4" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <AnimatePresence>
        {isAdding && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 z-[60]"
          >
            <motion.div 
              initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
              className="bg-zinc-950 border border-green-900/50 p-8 rounded-sm max-w-md w-full space-y-6"
            >
              <div className="flex items-center justify-between border-b border-green-900/30 pb-4">
                <h2 className="text-2xl font-black text-green-500 uppercase tracking-tighter flex items-center gap-2">
                  <Plus className="w-6 h-6" /> Initialize Course
                </h2>
                <button 
                  onClick={() => setIsAdding(false)}
                  className="text-gray-500 hover:text-white transition-colors"
                >
                  <LogOut className="w-5 h-5 rotate-180" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] text-green-900/50 uppercase font-bold ml-1">Title</label>
                  <input 
                    type="text" placeholder="COURSE_TITLE" 
                    className="w-full bg-black border border-green-900/30 p-3 text-white focus:border-green-500 outline-none transition-all"
                    value={newCourse.title} onChange={e => setNewCourse({...newCourse, title: e.target.value})}
                  />
                </div>
                
                <div className="space-y-1">
                  <label className="text-[10px] text-green-900/50 uppercase font-bold ml-1">Thumbnail URL (Optional)</label>
                  <input 
                    type="text" placeholder="https://example.com/image.jpg" 
                    className="w-full bg-black border border-green-900/30 p-3 text-white focus:border-green-500 outline-none transition-all"
                    value={newCourse.thumbnailUrl} onChange={e => setNewCourse({...newCourse, thumbnailUrl: e.target.value})}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-green-900/50 uppercase font-bold ml-1">Upload Thumbnail</label>
                  <div className="flex items-center gap-4">
                    <label className="flex-1 bg-zinc-900 border border-dashed border-green-900/30 p-4 rounded-sm cursor-pointer hover:border-green-500 transition-all group">
                      <div className="flex flex-col items-center gap-2">
                        <Plus className="w-6 h-6 text-green-900/50 group-hover:text-green-500" />
                        <span className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">
                          {thumbnailFile ? thumbnailFile.name : 'SELECT_IMAGE_FILE'}
                        </span>
                      </div>
                      <input 
                        type="file" 
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => setThumbnailFile(e.target.files?.[0] || null)}
                      />
                    </label>
                    {thumbnailFile && (
                      <button 
                        onClick={() => setThumbnailFile(null)}
                        className="p-2 text-red-500 hover:bg-red-900/10 rounded-sm transition-colors"
                      >
                        <Trash className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-green-900/50 uppercase font-bold ml-1">Category</label>
                  <select 
                    className="w-full bg-black border border-green-900/30 p-3 text-white focus:border-green-500 outline-none transition-all cursor-pointer"
                    value={newCourse.category} onChange={e => setNewCourse({...newCourse, category: e.target.value})}
                  >
                    <option value="General">General</option>
                    <option value="Web Security">Web Security</option>
                    <option value="Network Security">Network Security</option>
                    <option value="Malware Analysis">Malware Analysis</option>
                    <option value="Cryptography">Cryptography</option>
                    <option value="Forensics">Forensics</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-green-900/50 uppercase font-bold ml-1">Difficulty Level</label>
                  <select 
                    className="w-full bg-black border border-green-900/30 p-3 text-white focus:border-green-500 outline-none transition-all cursor-pointer"
                    value={newCourse.difficulty} onChange={e => setNewCourse({...newCourse, difficulty: e.target.value as any})}
                  >
                    <option value="Beginner">Beginner</option>
                    <option value="Intermediate">Intermediate</option>
                    <option value="Advanced">Advanced</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-green-900/50 uppercase font-bold ml-1">Description</label>
                  <textarea 
                    placeholder="Provide a brief overview of the module..." 
                    className="w-full bg-black border border-green-900/30 p-3 text-white focus:border-green-500 outline-none h-32 resize-none transition-all"
                    value={newCourse.description} onChange={e => setNewCourse({...newCourse, description: e.target.value})}
                  />
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <button 
                  onClick={addCourse} 
                  disabled={!newCourse.title || isUploading}
                  className="flex-1 bg-green-600 text-black py-4 font-bold hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all uppercase tracking-widest shadow-[0_0_20px_rgba(34,197,94,0.2)] flex items-center justify-center gap-2"
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      UPLOADING...
                    </>
                  ) : (
                    'Deploy Module'
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CourseEditor() {
  const { id } = useParams();
  const { user } = useAuth();
  const [course, setCourse] = useState<Course | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [isAddingLesson, setIsAddingLesson] = useState(false);
  const [newLesson, setNewLesson] = useState({ title: '', content: '', order: 0 });
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    if (!id) return;
    const unsubscribeCourse = onSnapshot(doc(db, 'courses', id), (doc) => {
      setCourse({ id: doc.id, ...doc.data() } as Course);
    }, (error) => handleFirestoreError(error, OperationType.GET, `courses/${id}`));
    const q = query(collection(db, 'courses', id, 'lessons'), orderBy('order'));
    const unsubscribeLessons = onSnapshot(q, (snapshot) => {
      setLessons(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Lesson)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, `courses/${id}/lessons`));
    return () => { unsubscribeCourse(); unsubscribeLessons(); };
  }, [id]);

  const addLesson = async () => {
    if (!id || !newLesson.title) return;
    const lessonId = Math.random().toString(36).substr(2, 9);
    try {
      await setDoc(doc(db, 'courses', id, 'lessons', lessonId), {
        ...newLesson,
        id: lessonId,
        courseId: id,
        order: lessons.length + 1
      });
      setIsAddingLesson(false);
      setNewLesson({ title: '', content: '', order: 0 });
      toast.success("Lesson added");
    } catch (error) {
      toast.error("Failed to add lesson");
    }
  };

  const deleteLesson = async (lessonId: string) => {
    if (!id || !confirm("Delete this lesson?")) return;
    try {
      toast.info("Delete operation requested");
    } catch (error) {
      toast.error("Failed to delete");
    }
  };

  const [fileInputs, setFileInputs] = useState<{[key: string]: string}>({});

  const addFile = async (lessonId: string, currentFiles: string[] = []) => {
    const url = fileInputs[lessonId];
    if (!url) return;
    try {
      await setDoc(doc(db, 'courses', id!, 'lessons', lessonId), {
        fileUrls: [...currentFiles, url]
      }, { merge: true });
      setFileInputs(prev => ({ ...prev, [lessonId]: '' }));
      toast.success("File attached");
    } catch (error) {
      toast.error("Failed to attach file");
    }
  };

  const removeFile = async (lessonId: string, urlToRemove: string, currentFiles: string[]) => {
    try {
      await setDoc(doc(db, 'courses', id!, 'lessons', lessonId), {
        fileUrls: currentFiles.filter(url => url !== urlToRemove)
      }, { merge: true });
      toast.success("File removed");
    } catch (error) {
      toast.error("Failed to remove file");
    }
  };

  const updateThumbnail = async () => {
    if (!id || !thumbnailFile) return;
    setIsUploading(true);
    try {
      const storageRef = ref(storage, `course_thumbnails/${id}/${thumbnailFile.name}`);
      const snapshot = await uploadBytes(storageRef, thumbnailFile);
      const url = await getDownloadURL(snapshot.ref);
      
      await updateDoc(doc(db, 'courses', id), {
        thumbnailUrl: url
      });
      
      setThumbnailFile(null);
      toast.success("Thumbnail updated");
    } catch (error) {
      console.error("Error updating thumbnail:", error);
      toast.error("Failed to update thumbnail");
    } finally {
      setIsUploading(false);
    }
  };

  const updateDifficulty = async (newDifficulty: 'Beginner' | 'Intermediate' | 'Advanced') => {
    if (!id) return;
    try {
      await updateDoc(doc(db, 'courses', id), {
        difficulty: newDifficulty
      });
      toast.success("Difficulty updated");
    } catch (error) {
      console.error("Error updating difficulty:", error);
      toast.error("Failed to update difficulty");
    }
  };

  if (!course) return <div className="p-6 text-green-500 font-mono">LOADING_COURSE_DATA...</div>;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8 font-mono">
      <div className="flex items-center justify-between border-b border-green-900/30 pb-6">
        <div className="flex items-center gap-6">
          <div className="w-24 h-24 bg-zinc-950 border border-green-900/30 rounded-sm overflow-hidden relative group">
            {course.thumbnailUrl ? (
              <img src={course.thumbnailUrl} alt={course.title} className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity" referrerPolicy="no-referrer" />
            ) : (
              <Terminal className="absolute inset-0 m-auto w-8 h-8 text-green-900/50" />
            )}
            <label className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center cursor-pointer transition-opacity">
              <Plus className="w-6 h-6 text-green-500" />
              <span className="text-[8px] text-green-500 font-bold uppercase mt-1">Change</span>
              <input 
                type="file" 
                accept="image/*" 
                className="hidden" 
                onChange={(e) => setThumbnailFile(e.target.files?.[0] || null)}
              />
            </label>
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-black text-green-500 uppercase tracking-tighter">{course.title}</h1>
              <select 
                className={cn(
                  "text-[10px] px-3 py-1 rounded-sm border uppercase font-bold bg-black outline-none cursor-pointer transition-all",
                  course.difficulty === 'Beginner' ? "border-green-500 text-green-500" :
                  course.difficulty === 'Intermediate' ? "border-yellow-500 text-yellow-500" :
                  "border-red-500 text-red-500"
                )}
                value={course.difficulty || 'Beginner'}
                onChange={(e) => updateDifficulty(e.target.value as any)}
              >
                <option value="Beginner">Beginner</option>
                <option value="Intermediate">Intermediate</option>
                <option value="Advanced">Advanced</option>
              </select>
            </div>
            <p className="text-gray-500 text-sm">TEACHER_ID: {course.teacherId}</p>
            {thumbnailFile && (
              <div className="mt-2 flex items-center gap-3">
                <span className="text-[10px] text-green-500 font-mono truncate max-w-[150px]">{thumbnailFile.name}</span>
                <button 
                  onClick={updateThumbnail}
                  disabled={isUploading}
                  className="bg-green-600 text-black px-2 py-1 text-[8px] font-black hover:bg-green-500 disabled:opacity-50"
                >
                  {isUploading ? 'UPLOADING...' : 'CONFIRM_UPLOAD'}
                </button>
                <button 
                  onClick={() => setThumbnailFile(null)}
                  className="text-red-500 hover:text-red-400"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        </div>
        <button 
          onClick={() => setIsAddingLesson(true)}
          className="bg-green-600 text-black px-4 py-2 rounded-sm font-bold text-sm hover:bg-green-500 flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> ADD_LESSON
        </button>
      </div>

      <div className="space-y-4">
        {lessons.map(l => (
          <div key={l.id} className="bg-zinc-950 border border-green-900/30 p-4 rounded-sm group">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="text-green-500 font-bold">#{l.order}</span>
                  <span className="text-white font-bold">{l.title}</span>
                </div>
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button className="p-2 text-gray-400 hover:text-green-500"><Edit className="w-4 h-4" /></button>
                  <button onClick={() => deleteLesson(l.id)} className="p-2 text-gray-400 hover:text-red-500"><Trash className="w-4 h-4" /></button>
                </div>
              </div>
              <div className="mt-4 space-y-3 border-t border-green-900/10 pt-4">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] text-green-900/50 uppercase font-bold">Attached Resources</label>
                  <span className="text-[9px] text-gray-600 uppercase tracking-widest">{l.fileUrls?.length || 0} FILES</span>
                </div>
                
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Terminal className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-green-900/30" />
                    <input 
                      type="text" 
                      placeholder="HTTPS://EXTERNAL-RESOURCE-URL.PDF" 
                      className="w-full bg-black border border-green-900/20 pl-7 pr-3 py-2 text-[10px] text-white focus:border-green-500 outline-none transition-all font-mono"
                      value={fileInputs[l.id] || ''}
                      onChange={e => setFileInputs(prev => ({ ...prev, [l.id]: e.target.value }))}
                      onKeyDown={e => e.key === 'Enter' && addFile(l.id, l.fileUrls)}
                    />
                  </div>
                  <button 
                    onClick={() => addFile(l.id, l.fileUrls)}
                    disabled={!fileInputs[l.id]}
                    className="bg-green-600 text-black px-4 py-2 text-[10px] font-black hover:bg-green-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all uppercase"
                  >
                    ATTACH
                  </button>
                </div>

                {l.fileUrls && l.fileUrls.length > 0 && (
                  <div className="grid gap-1.5 mt-2">
                    {l.fileUrls.map((url, i) => (
                      <div key={i} className="flex items-center justify-between bg-black/40 border border-green-900/10 px-3 py-1.5 rounded-sm group/file">
                        <div className="flex items-center gap-2 truncate flex-1">
                          <FileText className="w-3 h-3 text-green-900/50" />
                          <span className="text-[10px] text-gray-500 truncate font-mono">{url}</span>
                        </div>
                        <button 
                          onClick={() => removeFile(l.id, url, l.fileUrls!)}
                          className="text-gray-700 hover:text-red-500 transition-colors ml-2"
                        >
                          <Trash className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
        {lessons.length === 0 && <div className="text-center py-12 text-gray-600 border border-dashed border-green-900/20">NO_LESSONS_FOUND_IN_THIS_MODULE</div>}
      </div>

      <AnimatePresence>
        {isAddingLesson && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 z-[60]"
          >
            <motion.div 
              initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
              className="bg-zinc-950 border border-green-900/50 p-8 rounded-sm max-w-2xl w-full space-y-6"
            >
              <h2 className="text-2xl font-black text-green-500 uppercase tracking-tighter">New Lesson</h2>
              <div className="space-y-4">
                <input 
                  type="text" placeholder="LESSON_TITLE" 
                  className="w-full bg-black border border-green-900/30 p-3 text-white focus:border-green-500 outline-none"
                  value={newLesson.title} onChange={e => setNewLesson({...newLesson, title: e.target.value})}
                />
                <textarea 
                  placeholder="LESSON_CONTENT (MARKDOWN_SUPPORTED)" 
                  className="w-full bg-black border border-green-900/30 p-3 text-white focus:border-green-500 outline-none h-64 font-mono text-sm"
                  value={newLesson.content} onChange={e => setNewLesson({...newLesson, content: e.target.value})}
                />
              </div>
              <div className="flex gap-4">
                <button onClick={addLesson} className="flex-1 bg-green-600 text-black py-3 font-bold hover:bg-green-500">PUBLISH</button>
                <button onClick={() => setIsAddingLesson(false)} className="flex-1 border border-red-900/50 text-red-500 py-3 font-bold hover:bg-red-900/10">CANCEL</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Courses() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [teachers, setTeachers] = useState<UserProfile[]>([]);
  const [progressMap, setProgressMap] = useState<{[key: string]: UserProgress}>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTeacher, setSelectedTeacher] = useState('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'alphabetical'>('newest');
  const { isApprovedStudent, isAdmin, isTeacher, profile } = useAuth();

  useEffect(() => {
    const q = query(collection(db, 'courses'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setCourses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Course)));
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'users'), where('role', 'in', ['teacher', 'admin']));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setTeachers(snapshot.docs.map(doc => doc.data() as UserProfile));
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!profile?.uid) return;
    const q = query(collection(db, 'progress'), where('uid', '==', profile.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const map: {[key: string]: UserProgress} = {};
      snapshot.docs.forEach(doc => {
        const data = doc.data() as UserProgress;
        map[data.courseId] = data;
      });
      setProgressMap(map);
    });
    return unsubscribe;
  }, [profile?.uid]);

  const filteredCourses = courses
    .filter(c => {
      const matchesSearch = c.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                           c.description.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesTeacher = selectedTeacher === 'all' || c.teacherId === selectedTeacher;
      return matchesSearch && matchesTeacher;
    })
    .sort((a, b) => {
      if (sortBy === 'alphabetical') return a.title.localeCompare(b.title);
      const dateA = a.createdAt?.seconds || 0;
      const dateB = b.createdAt?.seconds || 0;
      return sortBy === 'newest' ? dateB - dateA : dateA - dateB;
    });

  if (!isApprovedStudent && !isAdmin && !isTeacher) {
    return (
      <div className="flex-1 w-full bg-black flex flex-col items-center justify-center p-6 text-center overflow-hidden">
        <motion.div 
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md space-y-8 font-mono flex flex-col items-center relative"
        >
          <div className="relative">
            <motion.div
              animate={{ 
                rotateY: [0, 360],
                z: [0, 50, 0]
              }}
              transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
              style={{ perspective: "1000px" }}
            >
              <Lock className="w-20 h-20 text-red-500" />
            </motion.div>
            <div className="absolute inset-0 bg-red-500/20 blur-2xl rounded-full animate-pulse" />
          </div>

          <div className="relative group">
            <h2 className="text-4xl sm:text-5xl font-black text-white uppercase tracking-tighter relative z-10">
              Access Denied
            </h2>
            {/* Glitch Layers */}
            <h2 className="text-4xl sm:text-5xl font-black text-red-500 uppercase tracking-tighter absolute top-0 left-0 -translate-x-1 z-0 opacity-70 animate-pulse">
              Access Denied
            </h2>
            <h2 className="text-4xl sm:text-5xl font-black text-blue-500 uppercase tracking-tighter absolute top-0 left-0 translate-x-1 z-0 opacity-70 animate-pulse">
              Access Denied
            </h2>
            <div className="h-1 w-24 bg-red-500 mx-auto mt-2" />
          </div>

          <p className="text-gray-500 text-[10px] md:text-xs tracking-[0.2em] max-w-sm leading-relaxed uppercase mx-auto px-4">
            {!profile ? (
              <Link to="/login" className="text-green-500 hover:underline">Login or Create Account first</Link>
            ) : (
              "Login or Create Account first"
            )}
          </p>

          <motion.div
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Link to="/" className="inline-block text-green-500 hover:text-black hover:bg-green-500 transition-all border border-green-500 px-10 py-4 rounded-full text-sm font-black tracking-widest shadow-[0_0_15px_rgba(34,197,94,0.2)]">
              RETURN_TO_BASE
            </Link>
          </motion.div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-12 font-mono">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-2">
          <h1 className="text-4xl md:text-5xl font-black text-green-500 tracking-tighter uppercase">Course Library</h1>
          <p className="text-xs md:text-sm text-gray-500 uppercase">SELECT_A_MODULE_TO_BEGIN_OPERATIONS</p>
        </div>
        
        <div className="flex flex-wrap gap-4 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Terminal className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-green-900/50" />
            <input 
              type="text" 
              placeholder="SEARCH_MODULES..." 
              className="w-full bg-zinc-950 border border-green-900/30 pl-10 pr-4 py-2 text-sm text-white focus:border-green-500 outline-none transition-all"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          
          <select 
            className="bg-zinc-950 border border-green-900/30 px-4 py-2 text-sm text-green-500 outline-none focus:border-green-500 transition-all"
            value={selectedTeacher}
            onChange={e => setSelectedTeacher(e.target.value)}
          >
            <option value="all">ALL_TEACHERS</option>
            {teachers.map(t => (
              <option key={t.uid} value={t.uid}>{t.displayName || t.email}</option>
            ))}
          </select>

          <select 
            className="bg-zinc-950 border border-green-900/30 px-4 py-2 text-sm text-green-500 outline-none focus:border-green-500 transition-all"
            value={sortBy}
            onChange={e => setSortBy(e.target.value as any)}
          >
            <option value="newest">NEWEST_FIRST</option>
            <option value="oldest">OLDEST_FIRST</option>
            <option value="alphabetical">A-Z</option>
          </select>
        </div>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
        {filteredCourses.map((c, i) => (
          <motion.div
            key={c.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
          >
            <Link to={`/course/${c.id}`} className="group block bg-zinc-950 border border-green-900/30 overflow-hidden rounded-sm hover:border-green-500 transition-all">
              <div className="aspect-video bg-zinc-900 relative overflow-hidden">
                <div className="absolute inset-0 bg-green-500/10 group-hover:bg-transparent transition-colors z-10" />
                {c.thumbnailUrl ? (
                  <motion.img 
                    whileHover={{ scale: 1.1 }}
                    src={c.thumbnailUrl} 
                    alt={c.title} 
                    className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-all duration-500" 
                    referrerPolicy="no-referrer" 
                  />
                ) : (
                  <Terminal className="absolute inset-0 m-auto w-12 h-12 text-green-900/50 group-hover:text-green-500 transition-colors" />
                )}
              </div>
              <div className="p-6 space-y-4">
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <h3 className="text-xl font-bold text-white group-hover:text-green-400 transition-colors">{c.title}</h3>
                    <span className={cn(
                      "text-[8px] px-2 py-0.5 rounded-full border uppercase font-bold",
                      c.difficulty === 'Beginner' ? "border-green-500 text-green-500" :
                      c.difficulty === 'Intermediate' ? "border-yellow-500 text-yellow-500" :
                      "border-red-500 text-red-500"
                    )}>
                      {c.difficulty || 'Beginner'}
                    </span>
                  </div>
                  {c.averageRating && (
                    <div className="flex items-center gap-1 text-yellow-500">
                      <Star className="w-3 h-3 fill-yellow-500" />
                      <span className="text-[10px] font-bold">{c.averageRating.toFixed(1)}</span>
                    </div>
                  )}
                </div>
                <p className="text-gray-500 text-sm line-clamp-2">{c.description}</p>
                <div className="pt-4 border-t border-green-900/10 flex items-center justify-between">
                  {progressMap[c.id] ? (
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-1 bg-green-900/20 rounded-full overflow-hidden">
                        <div className="h-full bg-green-500" style={{ width: `${progressMap[c.id].completionPercentage}%` }} />
                      </div>
                      <span className="text-[10px] text-green-500 font-bold">{progressMap[c.id].completionPercentage}%</span>
                    </div>
                  ) : (
                    <span className="text-[10px] text-green-500/50 uppercase tracking-widest">Module_v1.0</span>
                  )}
                  <ChevronRight className="w-4 h-4 text-green-500" />
                </div>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>

      {filteredCourses.length === 0 && (
        <div className="text-center py-20 border border-dashed border-green-900/20 rounded-sm">
          <Terminal className="w-12 h-12 text-green-900/20 mx-auto mb-4" />
          <p className="text-gray-600 uppercase tracking-widest text-sm">No_modules_found_matching_criteria</p>
        </div>
      )}
    </div>
  );
}

function CourseView() {
  const { id } = useParams();
  const { profile } = useAuth();
  const [course, setCourse] = useState<Course | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [activeLesson, setActiveLesson] = useState<Lesson | null>(null);
  const [password, setPassword] = useState('');
  const [isVerified, setIsVerified] = useState(false);
  const [progress, setProgress] = useState<UserProgress | null>(null);
  const [userRating, setUserRating] = useState<number | null>(null);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (activeLesson && progress?.lessonNotes) {
      setNote(progress.lessonNotes[activeLesson.id] || '');
    } else {
      setNote('');
    }
  }, [activeLesson?.id, progress?.lessonNotes]);

  useEffect(() => {
    const saveNote = async () => {
      if (!id || !profile?.uid || !activeLesson) return;
      const progressId = `${profile.uid}_${id}`;
      
      try {
        await setDoc(doc(db, 'progress', progressId), {
          lessonNotes: {
            [activeLesson.id]: note
          }
        }, { merge: true });
      } catch (error) {
        console.error("Failed to save note:", error);
      }
    };

    const timeoutId = setTimeout(() => {
      if (activeLesson && note !== (progress?.lessonNotes?.[activeLesson.id] || '')) {
        saveNote();
      }
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, [note, activeLesson?.id, id, profile?.uid, progress?.lessonNotes]);

  useEffect(() => {
    if (!id || !profile?.uid) return;
    const ratingId = `${profile.uid}_${id}`;
    const unsubscribeRating = onSnapshot(doc(db, 'ratings', ratingId), (doc) => {
      if (doc.exists()) {
        setUserRating(doc.data().rating);
      }
    });
    return unsubscribeRating;
  }, [id, profile?.uid]);

  const handleRate = async (rating: number) => {
    if (!id || !profile?.uid || !course) return;
    const ratingId = `${profile.uid}_${id}`;
    
    try {
      const oldRating = userRating;
      await setDoc(doc(db, 'ratings', ratingId), {
        id: ratingId,
        uid: profile.uid,
        courseId: id,
        rating,
        createdAt: new Date().toISOString()
      });

      // Update course average rating
      const courseRef = doc(db, 'courses', id);
      const courseSnap = await getDoc(courseRef);
      if (courseSnap.exists()) {
        const data = courseSnap.data();
        let newCount = data.ratingCount || 0;
        let newAverage = data.averageRating || 0;

        if (oldRating === null) {
          // New rating
          newAverage = ((newAverage * newCount) + rating) / (newCount + 1);
          newCount += 1;
        } else {
          // Update existing rating
          newAverage = ((newAverage * newCount) - oldRating + rating) / newCount;
        }

        await setDoc(courseRef, {
          averageRating: newAverage,
          ratingCount: newCount
        }, { merge: true });
      }

      toast.success("Rating submitted!");
    } catch (error) {
      toast.error("Failed to submit rating");
    }
  };

  useEffect(() => {
    if (!id) return;
    const unsubscribeCourse = onSnapshot(doc(db, 'courses', id), (doc) => {
      setCourse({ id: doc.id, ...doc.data() } as Course);
    }, (error) => handleFirestoreError(error, OperationType.GET, `courses/${id}`));
    const q = query(collection(db, 'courses', id, 'lessons'), orderBy('order'));
    const unsubscribeLessons = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Lesson));
      setLessons(data);
      if (data.length > 0 && !activeLesson) setActiveLesson(data[0]);
    }, (error) => handleFirestoreError(error, OperationType.LIST, `courses/${id}/lessons`));
    return () => { unsubscribeCourse(); unsubscribeLessons(); };
  }, [id, activeLesson]);

  useEffect(() => {
    if (!id || !profile?.uid) return;
    const progressId = `${profile.uid}_${id}`;
    const unsubscribeProgress = onSnapshot(doc(db, 'progress', progressId), (doc) => {
      if (doc.exists()) {
        setProgress(doc.data() as UserProgress);
      } else {
        setProgress(null);
      }
    });
    return unsubscribeProgress;
  }, [id, profile?.uid]);

  const toggleLessonCompletion = async (lessonId: string) => {
    if (!id || !profile?.uid) return;
    const progressId = `${profile.uid}_${id}`;
    const currentCompleted = progress?.completedLessons || [];
    const isCompleted = currentCompleted.includes(lessonId);
    
    let newCompleted;
    if (isCompleted) {
      newCompleted = currentCompleted.filter(lid => lid !== lessonId);
    } else {
      newCompleted = [...currentCompleted, lessonId];
    }

    const percentage = lessons.length > 0 ? Math.round((newCompleted.length / lessons.length) * 100) : 0;

    try {
      await setDoc(doc(db, 'progress', progressId), {
        uid: profile.uid,
        courseId: id,
        completedLessons: newCompleted,
        lastAccessed: new Date().toISOString(),
        completionPercentage: percentage
      }, { merge: true });

      if (percentage === 100 && !isCompleted) {
        // Award badge
        const badgeId = `badge_${profile.uid}_${id}`;
        await setDoc(doc(db, 'badges', badgeId), {
          id: badgeId,
          uid: profile.uid,
          courseId: id,
          courseTitle: course?.title || 'Unknown Course',
          awardedAt: new Date().toISOString(),
          icon: 'Award'
        }, { merge: true });

        // Award certificate
        const certId = `cert_${profile.uid}_${id}`;
        await setDoc(doc(db, 'certificates', certId), {
          id: certId,
          uid: profile.uid,
          courseId: id,
          courseTitle: course?.title || 'Unknown Course',
          studentName: profile.displayName || profile.email,
          issuedAt: new Date().toISOString(),
          certificateNumber: `CERT-${Math.random().toString(36).substr(2, 9).toUpperCase()}`
        }, { merge: true });
        
        toast.success("CONGRATULATIONS! YOU_HAVE_EARNED_A_BADGE_AND_CERTIFICATE!");
      }

      toast.success(isCompleted ? "Lesson marked as incomplete" : "Lesson completed!");
    } catch (error) {
      toast.error("Failed to update progress");
    }
  };

  const downloadLessonMD = (lesson: Lesson) => {
    const blob = new Blob([lesson.content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${lesson.title.replace(/\s+/g, '_')}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Lesson content downloaded for offline access");
  };

  const verifyPassword = () => {
    if (profile?.role === 'admin' || profile?.role === 'teacher') {
      setIsVerified(true);
      return;
    }
    if (password === profile?.accessPassword) {
      setIsVerified(true);
      toast.success("Access Granted");
    } else {
      toast.error("Invalid Access Password");
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (!isVerified || lessons.length === 0) return;

      const currentIndex = lessons.findIndex(l => l.id === activeLesson?.id);

      if (e.key === 'ArrowRight') {
        if (currentIndex < lessons.length - 1) {
          setActiveLesson(lessons[currentIndex + 1]);
        }
      } else if (e.key === 'ArrowLeft') {
        if (currentIndex > 0) {
          setActiveLesson(lessons[currentIndex - 1]);
        }
      } else if (e.key.toLowerCase() === 'c') {
        if (activeLesson) {
          toggleLessonCompletion(activeLesson.id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isVerified, lessons, activeLesson, toggleLessonCompletion]);

  if (!isVerified) {
    return (
      <div className="min-h-[calc(100vh-64px)] bg-black flex items-center justify-center p-6 font-mono">
        <div className="max-w-md w-full bg-zinc-950 border border-green-900/30 p-10 rounded-sm shadow-2xl space-y-6">
          <div className="text-center space-y-2">
            <Lock className="w-12 h-12 text-green-500 mx-auto mb-4" />
            <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Encrypted Module</h2>
            <p className="text-gray-500 text-xs">ENTER_ACCESS_KEY_TO_DECRYPT_CONTENT</p>
          </div>
          <input 
            type="password" 
            placeholder="ACCESS_KEY" 
            className="w-full bg-black border border-green-900/30 p-3 text-white focus:border-green-500 outline-none text-center tracking-[0.5em]"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && verifyPassword()}
          />
          <button 
            onClick={verifyPassword}
            className="w-full bg-green-600 text-black py-3 font-bold hover:bg-green-500 transition-colors"
          >
            DECRYPT_MODULE
          </button>
        </div>
      </div>
    );
  }

  if (!course) return <div className="p-6 text-green-500 font-mono">DECRYPTING_DATA...</div>;

  return (
    <div className="min-h-[calc(100vh-64px)] bg-black flex flex-col md:flex-row font-mono">
      {/* Sidebar */}
      <div className="w-full md:w-80 border-b md:border-b-0 md:border-r border-green-900/30 bg-zinc-950 flex flex-col md:h-[calc(100vh-64px)]">
        <div className="p-4 md:p-6 border-b border-green-900/30 space-y-4">
          <div>
            <div className="flex justify-between items-start gap-4">
              <h2 className="text-base md:text-lg font-black text-green-500 uppercase tracking-tighter">{course.title}</h2>
              {course.averageRating && (
                <div className="flex items-center gap-1 text-yellow-500 shrink-0">
                  <Star className="w-3 h-3 fill-yellow-500" />
                  <span className="text-[10px] font-bold">{course.averageRating.toFixed(1)}</span>
                </div>
              )}
            </div>
            <p className="text-[10px] text-gray-500 uppercase mt-1">Syllabus_v1.0</p>
          </div>
          
          {/* Progress Bar */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-[10px] font-bold">
              <span className="text-gray-500">COMPLETION_STATUS</span>
              <span className="text-green-500">{progress?.completionPercentage || 0}%</span>
            </div>
            <div className="h-1 bg-green-900/20 rounded-full overflow-hidden">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${progress?.completionPercentage || 0}%` }}
                className="h-full bg-green-500"
              />
            </div>
          </div>
        </div>
        <div className="p-2 space-y-1 flex-1 overflow-y-auto max-h-[300px] md:max-h-none">
          {lessons.map(l => {
            const isCompleted = progress?.completedLessons?.includes(l.id);
            return (
              <div key={l.id} className="flex items-center gap-1 group">
                <button 
                  onClick={() => toggleLessonCompletion(l.id)}
                  className={cn(
                    "p-2 transition-all duration-300",
                    isCompleted ? "text-green-500 scale-110" : "text-gray-700 hover:text-green-900/50"
                  )}
                >
                  <AnimatePresence mode="wait">
                    {isCompleted ? (
                      <motion.div
                        key="completed"
                        initial={{ scale: 0, rotate: -45 }}
                        animate={{ scale: 1, rotate: 0 }}
                        exit={{ scale: 0, rotate: 45 }}
                      >
                        <CheckCircle className="w-4 h-4 shadow-[0_0_10px_rgba(34,197,94,0.5)]" />
                      </motion.div>
                    ) : (
                      <motion.div
                        key="incomplete"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                      >
                        <Shield className="w-4 h-4" />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </button>
                <button 
                  onClick={() => setActiveLesson(l)}
                  className={cn(
                    "flex-1 text-left p-3 md:p-4 rounded-sm transition-all flex items-center gap-3",
                    activeLesson?.id === l.id ? "bg-green-900/20 text-green-400 border-l-4 border-green-500" : "text-gray-400 hover:bg-green-900/5 hover:text-gray-200"
                  )}
                >
                  <span className="text-[10px] opacity-50">{l.order.toString().padStart(2, '0')}</span>
                  <span className="text-xs md:text-sm font-bold truncate">{l.title}</span>
                </button>
              </div>
            );
          })}
        </div>
        
        {/* Keyboard Shortcuts Info - Hidden on mobile */}
        <div className="hidden md:block mt-auto p-6 border-t border-green-900/10 space-y-3">
          <h3 className="text-[10px] font-black text-gray-600 uppercase tracking-widest">Hotkeys</h3>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center gap-2 text-[9px] text-gray-500">
              <kbd className="bg-zinc-900 px-1.5 py-0.5 rounded border border-green-900/30 text-green-500 font-bold">←/→</kbd>
              <span>NAVIGATE</span>
            </div>
            <div className="flex items-center gap-2 text-[9px] text-gray-500">
              <kbd className="bg-zinc-900 px-1.5 py-0.5 rounded border border-green-900/30 text-green-500 font-bold">C</kbd>
              <span>COMPLETE</span>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto bg-black p-4 md:p-12">
        {activeLesson ? (
          <motion.div 
            key={activeLesson.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-4xl mx-auto space-y-6 md:space-y-8"
          >
            <div className="space-y-4 border-b border-green-900/30 pb-6 md:pb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="text-green-500 text-[10px] md:text-xs tracking-widest uppercase">Lesson_{activeLesson.order}</span>
                <h1 className="text-2xl md:text-5xl font-black text-white tracking-tighter uppercase">{activeLesson.title}</h1>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button 
                  onClick={() => downloadLessonMD(activeLesson)}
                  className="px-3 py-2 md:px-4 md:py-3 rounded-full font-bold text-[10px] md:text-xs border border-green-900/30 text-green-500 hover:bg-green-900/10 transition-all flex items-center gap-2"
                >
                  <Download className="w-3 h-3 md:w-4 md:h-4" /> DOWNLOAD
                </button>
                <button 
                  onClick={() => toggleLessonCompletion(activeLesson.id)}
                  className={cn(
                    "px-4 py-2 md:px-6 md:py-3 rounded-full font-bold text-xs md:text-sm transition-all flex items-center gap-2 relative overflow-hidden group",
                    progress?.completedLessons?.includes(activeLesson.id) 
                      ? "bg-green-900/20 text-green-500 border border-green-500/30" 
                      : "bg-green-600 text-black hover:bg-green-500 shadow-[0_0_15px_rgba(34,197,94,0.3)]"
                  )}
                >
                  {progress?.completedLessons?.includes(activeLesson.id) ? (
                    <>
                      <motion.span
                        initial={{ y: 20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        className="flex items-center gap-2"
                      >
                        COMPLETED <CheckCircle className="w-3 h-3 md:w-4 md:h-4 fill-green-500/20" />
                      </motion.span>
                    </>
                  ) : (
                    <>MARK_AS_COMPLETED</>
                  )}
                </button>
              </div>
            </div>
            <div className="prose prose-invert prose-green max-w-none">
              <ReactMarkdown components={{
                h1: ({node, ...props}) => <h1 className="text-green-500 font-black uppercase tracking-tighter mt-8 mb-4 border-b border-green-900/20 pb-2" {...props} />,
                h2: ({node, ...props}) => <h2 className="text-green-400 font-bold uppercase tracking-tight mt-6 mb-3" {...props} />,
                p: ({node, ...props}) => <p className="text-gray-300 leading-relaxed mb-4" {...props} />,
                code: ({node, ...props}) => <code className="bg-zinc-900 text-green-400 px-1.5 py-0.5 rounded font-mono text-sm" {...props} />,
                pre: ({node, ...props}) => <pre className="bg-zinc-900 border border-green-900/30 p-6 rounded-sm overflow-x-auto my-6" {...props} />,
                ul: ({node, ...props}) => <ul className="list-disc list-inside text-gray-300 space-y-2 mb-4" {...props} />,
                li: ({node, ...props}) => <li className="marker:text-green-500" {...props} />,
              }}>
                {activeLesson.content}
              </ReactMarkdown>
            </div>

            {/* Private Notes Section */}
            <div className="mt-12 pt-8 border-t border-green-900/30 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black text-green-500 uppercase tracking-widest flex items-center gap-2">
                  <FileText className="w-4 h-4" /> PRIVATE_DECRYPTION_NOTES
                </h3>
                <span className="text-[10px] text-gray-600 uppercase">AUTO_SAVING...</span>
              </div>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="ENTER_YOUR_PRIVATE_OBSERVATIONS_HERE..."
                className="w-full h-32 bg-zinc-950 border border-green-900/20 p-4 text-sm text-gray-300 font-mono focus:border-green-500 outline-none transition-all resize-none"
              />
            </div>

            {activeLesson.fileUrls && activeLesson.fileUrls.length > 0 && (
              <div className="mt-12 pt-8 border-t border-green-900/30 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-black text-green-500 uppercase tracking-widest flex items-center gap-2">
                    <FileText className="w-4 h-4" /> ATTACHED_RESOURCES
                  </h3>
                  {activeLesson.fileUrls.length > 1 && (
                    <button 
                      onClick={() => {
                        activeLesson.fileUrls?.forEach(url => window.open(url, '_blank'));
                        toast.success("Opening all resources...");
                      }}
                      className="text-[10px] font-bold text-green-500 hover:underline flex items-center gap-1"
                    >
                      <Download className="w-3 h-3" /> DOWNLOAD_ALL
                    </button>
                  )}
                </div>
                <div className="grid gap-2">
                  {activeLesson.fileUrls.map((url, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <a 
                        href={url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex-1 flex items-center justify-between p-3 bg-zinc-950 border border-green-900/20 rounded-sm hover:border-green-500/50 transition-all group"
                      >
                        <span className="text-xs text-gray-400 truncate max-w-[80%] font-mono">{url}</span>
                        <ExternalLink className="w-3 h-3 text-gray-600 group-hover:text-green-500 transition-colors" />
                      </a>
                      <a 
                        href={url} 
                        download 
                        className="p-3 bg-zinc-950 border border-green-900/20 rounded-sm text-gray-500 hover:text-green-500 hover:border-green-500/50 transition-all"
                        title="Download File"
                      >
                        <Download className="w-4 h-4" />
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {progress?.completionPercentage === 100 && (
              <div className="mt-12 pt-8 border-t border-green-900/30 space-y-6">
                <div className="text-center space-y-2">
                  <h3 className="text-sm font-black text-green-500 uppercase tracking-widest">RATE_THIS_MODULE</h3>
                  <p className="text-xs text-gray-500">YOUR_FEEDBACK_HELPS_IMPROVE_THE_CURRICULUM</p>
                </div>
                <div className="flex justify-center gap-4">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      onClick={() => handleRate(star)}
                      className="group transition-all"
                    >
                      <Star 
                        className={cn(
                          "w-10 h-10 transition-all",
                          (userRating || 0) >= star 
                            ? "text-yellow-500 fill-yellow-500" 
                            : "text-zinc-800 group-hover:text-yellow-500/50"
                        )}
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        ) : (
          <div className="h-full flex items-center justify-center text-gray-600 italic">
            SELECT_A_LESSON_TO_BEGIN_DECRYPTION
          </div>
        )}
      </div>
      {activeLesson && (
        <AITutor 
          courseTitle={course?.title || ''} 
          lessonTitle={activeLesson.title} 
          lessonContent={activeLesson.content} 
        />
      )}
    </div>
  );
}

function Dashboard() {
  const { profile } = useAuth();
  const [enrolledCourses, setEnrolledCourses] = useState<(Course & { progress: UserProgress, nextLesson?: Lesson })[]>([]);
  const [userRatings, setUserRatings] = useState<{[key: string]: number}>({});
  const [stats, setStats] = useState({
    totalCourses: 0,
    avgProgress: 0,
    badgesCount: 0,
    completedCourses: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.uid) return;

    const qProgress = query(collection(db, 'progress'), where('uid', '==', profile.uid));
    const unsubscribeProgress = onSnapshot(qProgress, async (snapshot) => {
      const progressDocs = snapshot.docs.map(doc => doc.data() as UserProgress);
      
      if (progressDocs.length === 0) {
        setEnrolledCourses([]);
        setStats({ totalCourses: 0, avgProgress: 0, badgesCount: 0, completedCourses: 0 });
        setLoading(false);
        return;
      }

      const coursePromises = progressDocs.map(async (p) => {
        const courseDoc = await getDoc(doc(db, 'courses', p.courseId));
        if (!courseDoc.exists()) return null;
        const courseData = courseDoc.data() as Course;
        
        const lessonsQ = query(collection(db, 'courses', p.courseId, 'lessons'), orderBy('order'));
        const lessonsSnapshot = await getDocs(lessonsQ);
        const lessons = lessonsSnapshot.docs.map(d => d.data() as Lesson);
        const nextLesson = lessons.find(l => !p.completedLessons.includes(l.id));

        return {
          ...courseData,
          id: courseDoc.id,
          progress: p,
          nextLesson
        };
      });

      const coursesWithProgress = (await Promise.all(coursePromises)).filter(c => c !== null) as (Course & { progress: UserProgress, nextLesson?: Lesson })[];
      setEnrolledCourses(coursesWithProgress);

      const total = progressDocs.length;
      const completed = progressDocs.filter(p => p.completionPercentage === 100).length;
      const avg = progressDocs.reduce((acc, curr) => acc + curr.completionPercentage, 0) / total;
      
      setStats(prev => ({
        ...prev,
        totalCourses: total,
        completedCourses: completed,
        avgProgress: Math.round(avg)
      }));
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'progress'));

    const qBadges = query(collection(db, 'badges'), where('uid', '==', profile.uid));
    const unsubscribeBadges = onSnapshot(qBadges, (snapshot) => {
      setStats(prev => ({ ...prev, badgesCount: snapshot.size }));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'badges'));

    const qRatings = query(collection(db, 'ratings'), where('uid', '==', profile.uid));
    const unsubscribeRatings = onSnapshot(qRatings, (snapshot) => {
      const ratings: {[key: string]: number} = {};
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        ratings[data.courseId] = data.rating;
      });
      setUserRatings(ratings);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'ratings'));

    return () => {
      unsubscribeProgress();
      unsubscribeBadges();
      unsubscribeRatings();
    };
  }, [profile?.uid]);

  const handleRate = async (courseId: string, rating: number) => {
    if (!profile?.uid) return;
    const ratingId = `${profile.uid}_${courseId}`;
    const oldRating = userRatings[courseId] || null;
    
    try {
      await setDoc(doc(db, 'ratings', ratingId), {
        id: ratingId,
        uid: profile.uid,
        courseId: courseId,
        rating,
        createdAt: new Date().toISOString()
      });

      // Update course average rating
      const courseRef = doc(db, 'courses', courseId);
      const courseSnap = await getDoc(courseRef);
      if (courseSnap.exists()) {
        const data = courseSnap.data();
        let newCount = data.ratingCount || 0;
        let newAverage = data.averageRating || 0;

        if (oldRating === null) {
          newAverage = ((newAverage * newCount) + rating) / (newCount + 1);
          newCount += 1;
        } else {
          newAverage = ((newAverage * newCount) - oldRating + rating) / newCount;
        }

        await setDoc(courseRef, {
          averageRating: newAverage,
          ratingCount: newCount
        }, { merge: true });
      }

      toast.success("Rating submitted!");
    } catch (error) {
      toast.error("Failed to submit rating");
    }
  };

  if (loading) return (
    <div className="min-h-[calc(100vh-64px)] bg-black flex flex-col items-center justify-center p-6 space-y-4 font-mono">
      <Loader2 className="w-12 h-12 text-green-500 animate-spin" />
      <p className="text-green-500 text-xs animate-pulse uppercase tracking-[0.3em]">INITIALIZING_COMMAND_CENTER...</p>
    </div>
  );

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 md:space-y-12 font-mono">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-green-900/30 pb-10">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-green-500 text-[10px] tracking-[0.3em] uppercase font-bold">System_Online</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-black text-white uppercase tracking-tighter leading-none">Command Center</h1>
          <p className="text-gray-500 text-xs uppercase tracking-widest">Operator: <span className="text-green-500">{profile?.displayName?.toUpperCase() || 'UNKNOWN_USER'}</span></p>
        </div>
        <div className="grid grid-cols-2 sm:flex gap-4">
          <div className="bg-zinc-950 border border-green-900/30 p-4 rounded-sm min-w-[140px] relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-12 h-12 bg-green-500/5 -rotate-45 translate-x-6 -translate-y-6" />
            <p className="text-[10px] text-gray-600 uppercase font-bold mb-1">Avg_Progress</p>
            <p className="text-3xl font-black text-green-500">{stats.avgProgress}%</p>
          </div>
          <div className="bg-zinc-950 border border-green-900/30 p-4 rounded-sm min-w-[140px] relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-12 h-12 bg-yellow-500/5 -rotate-45 translate-x-6 -translate-y-6" />
            <p className="text-[10px] text-gray-600 uppercase font-bold mb-1">Badges_Earned</p>
            <p className="text-3xl font-black text-yellow-500">{stats.badgesCount}</p>
          </div>
        </div>
      </div>

      {/* Enrolled Courses Grid */}
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-black text-green-500 uppercase tracking-widest flex items-center gap-3">
            <div className="w-4 h-px bg-green-500" />
            Active_Modules
          </h2>
          <span className="text-[10px] text-gray-600 uppercase font-bold">{enrolledCourses.length} ACTIVE_SESSIONS</span>
        </div>
        
        {enrolledCourses.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
            {enrolledCourses.map(course => (
              <motion.div 
                key={course.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-zinc-950 border border-green-900/20 p-6 md:p-8 rounded-sm hover:border-green-500/30 transition-all group relative"
              >
                <div className="flex flex-col sm:flex-row gap-6 md:gap-8">
                  <div className="w-full sm:w-32 h-32 bg-black border border-green-900/30 rounded-sm overflow-hidden shrink-0 relative">
                    {course.thumbnailUrl ? (
                      <img src={course.thumbnailUrl} alt="" className="w-full h-full object-cover opacity-40 group-hover:opacity-100 transition-all duration-500" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-green-900/5">
                        <Shield className="w-10 h-10 text-green-900/20" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent sm:hidden" />
                  </div>
                  <div className="flex-1 space-y-6">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-green-500/50 uppercase font-bold tracking-widest">{course.category || 'GENERAL_INTEL'}</span>
                          <span className={cn(
                            "text-[8px] px-2 py-0.5 rounded-full border uppercase font-bold",
                            course.difficulty === 'Beginner' ? "border-green-500 text-green-500" :
                            course.difficulty === 'Intermediate' ? "border-yellow-500 text-yellow-500" :
                            "border-red-500 text-red-500"
                          )}>
                            {course.difficulty || 'Beginner'}
                          </span>
                        </div>
                        {course.progress.completionPercentage === 100 && (
                          <div className="flex items-center gap-1 text-green-500">
                            <CheckCircle className="w-3 h-3" />
                            <span className="text-[8px] font-black uppercase">Verified</span>
                          </div>
                        )}
                      </div>
                      <h3 className="text-2xl font-black text-white uppercase tracking-tighter group-hover:text-green-500 transition-colors leading-tight">{course.title}</h3>
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex justify-between text-[10px] font-bold">
                        <span className="text-gray-600 uppercase tracking-widest">Sync_Progress</span>
                        <span className="text-green-500">{course.progress.completionPercentage}%</span>
                      </div>
                      <div className="h-1.5 bg-green-900/10 rounded-full overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${course.progress.completionPercentage}%` }}
                          transition={{ duration: 1.5, ease: "easeOut" }}
                          className="h-full bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]"
                        />
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
                      {course.nextLesson ? (
                        <div className="space-y-1">
                          <p className="text-[9px] text-gray-600 uppercase font-bold tracking-widest">Next_Objective</p>
                          <p className="text-xs text-gray-300 font-bold truncate max-w-[200px]">{course.nextLesson.title}</p>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center gap-2 text-green-500 bg-green-900/10 px-3 py-1.5 rounded-full border border-green-500/20 w-fit">
                            <Medal className="w-3 h-3" />
                            <span className="text-[9px] font-black uppercase tracking-widest">Mission_Complete</span>
                          </div>
                          <div className="flex items-center gap-1">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <button
                                key={star}
                                onClick={(e) => {
                                  e.preventDefault();
                                  handleRate(course.id, star);
                                }}
                                className="transition-all hover:scale-110"
                              >
                                <Star 
                                  className={cn(
                                    "w-3 h-3",
                                    (userRatings[course.id] || 0) >= star 
                                      ? "text-yellow-500 fill-yellow-500" 
                                      : "text-zinc-800 hover:text-yellow-500/50"
                                  )}
                                />
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      <Link 
                        to={`/course/${course.id}`}
                        className="bg-green-600 text-black px-6 py-2.5 text-[10px] font-black hover:bg-green-500 transition-all uppercase tracking-widest text-center"
                      >
                        {course.progress.completionPercentage === 100 ? 'REVIEW_DATA' : 'RESUME_SYNC'}
                      </Link>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="text-center py-24 bg-zinc-950 border border-dashed border-green-900/20 rounded-sm space-y-6">
            <div className="flex justify-center">
              <div className="w-16 h-16 bg-green-900/5 rounded-full flex items-center justify-center border border-green-900/10">
                <Terminal className="w-8 h-8 text-green-900/30" />
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-gray-500 uppercase tracking-[0.2em] text-sm font-bold">No active modules detected in your sector</p>
              <p className="text-gray-700 text-[10px] uppercase">Initialize a new session to begin data decryption</p>
            </div>
            <Link 
              to="/courses" 
              className="inline-flex items-center gap-2 bg-green-900/10 border border-green-500/30 text-green-500 px-6 py-3 text-xs font-black hover:bg-green-500 hover:text-black transition-all uppercase tracking-widest"
            >
              Browse_Catalog <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

function Profile() {
  const { profile } = useAuth();
  const [badges, setBadges] = useState<Badge[]>([]);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.uid) return;

    const qBadges = query(collection(db, 'badges'), where('uid', '==', profile.uid));
    const unsubscribeBadges = onSnapshot(qBadges, (snapshot) => {
      setBadges(snapshot.docs.map(doc => doc.data() as Badge));
    });

    const qCerts = query(collection(db, 'certificates'), where('uid', '==', profile.uid));
    const unsubscribeCerts = onSnapshot(qCerts, (snapshot) => {
      setCertificates(snapshot.docs.map(doc => doc.data() as Certificate));
      setLoading(false);
    });

    return () => {
      unsubscribeBadges();
      unsubscribeCerts();
    };
  }, [profile?.uid]);

  if (!profile) return null;

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-8 md:space-y-12 font-mono">
      <div className="flex flex-col md:flex-row items-center gap-6 md:gap-8 bg-zinc-950 border border-green-900/30 p-6 md:p-8 rounded-sm">
        <div className="relative">
          <img 
            src={profile.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.displayName || 'User')}&background=000&color=22c55e`} 
            className="w-24 h-24 md:w-32 md:h-32 rounded-full border-2 border-green-500 p-1" 
            alt="" 
            referrerPolicy="no-referrer" 
          />
          <div className="absolute -bottom-1 -right-1 md:-bottom-2 md:-right-2 bg-green-600 text-black p-1.5 md:p-2 rounded-full shadow-lg">
            <Shield className="w-4 h-4 md:w-5 md:h-5" />
          </div>
        </div>
        <div className="text-center md:text-left space-y-2 flex-1">
          <h1 className="text-3xl md:text-4xl font-black text-white uppercase tracking-tighter">{profile.displayName || 'ANONYMOUS_USER'}</h1>
          <p className="text-green-500 font-bold uppercase tracking-widest text-[10px] md:text-sm">{profile.role} // {profile.status}</p>
          
          <div className="pt-4 space-y-3 border-t border-green-900/20 mt-4">
            <div className="flex flex-col gap-1">
              <span className="text-[8px] text-gray-600 uppercase tracking-[0.2em]">Email Address</span>
              <span className="text-gray-300 text-xs md:text-sm break-all">{profile.email}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[8px] text-gray-600 uppercase tracking-[0.2em]">User ID</span>
              <span className="text-gray-500 text-[8px] md:text-[10px] font-mono">{profile.uid}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[8px] text-gray-600 uppercase tracking-[0.2em]">Photo URL</span>
              <span className="text-gray-500 text-[8px] md:text-[10px] font-mono break-all opacity-50 hover:opacity-100 transition-opacity cursor-default">
                {profile.photoURL || 'NO_PHOTO_URL_PROVIDED'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 md:gap-12">
        <div className="space-y-6">
          <h2 className="text-xl md:text-2xl font-black text-green-500 uppercase tracking-tighter flex items-center gap-3">
            <Award className="w-5 h-5 md:w-6 md:h-6" /> ACHIEVEMENTS_BADGES
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 md:gap-4">
            {badges.length > 0 ? badges.map((badge) => (
              <motion.div 
                key={badge.id}
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                whileHover={{ scale: 1.05 }}
                className="bg-zinc-950 border border-green-900/30 p-3 md:p-4 rounded-sm text-center space-y-3 group hover:border-green-500 transition-all"
              >
                <div className="w-12 h-12 md:w-16 md:h-16 bg-green-900/20 rounded-full flex items-center justify-center mx-auto group-hover:bg-green-500/20 transition-colors">
                  <Medal className="w-6 h-6 md:w-8 md:h-8 text-green-500" />
                </div>
                <div className="space-y-1">
                  <div className="text-[8px] md:text-[10px] text-green-500 font-bold uppercase tracking-widest">{badge.courseTitle}</div>
                  <div className="text-[7px] md:text-[8px] text-gray-600 uppercase">Awarded: {new Date(badge.awardedAt).toLocaleDateString()}</div>
                </div>
              </motion.div>
            )) : (
              <div className="col-span-full py-8 md:py-12 text-center border border-dashed border-green-900/20 rounded-sm">
                <p className="text-gray-600 uppercase tracking-widest text-[10px] md:text-xs">NO_ACHIEVEMENTS_UNLOCKED_YET</p>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <h2 className="text-xl md:text-2xl font-black text-green-500 uppercase tracking-tighter flex items-center gap-3">
            <FileText className="w-5 h-5 md:w-6 md:h-6" /> CERTIFICATIONS
          </h2>
          <div className="space-y-3 md:space-y-4">
            {certificates.length > 0 ? certificates.map((cert) => (
              <motion.div 
                key={cert.id}
                initial={{ x: 20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                className="bg-zinc-950 border border-green-900/30 p-4 md:p-6 rounded-sm flex items-center justify-between group hover:border-green-500 transition-all gap-4"
              >
                <div className="space-y-1 md:space-y-2 min-w-0">
                  <h3 className="text-sm md:text-lg font-bold text-white group-hover:text-green-400 transition-colors truncate">{cert.courseTitle}</h3>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[8px] md:text-[10px] text-gray-500 uppercase tracking-widest">
                    <span>ID: {cert.certificateNumber}</span>
                    <span>ISSUED: {new Date(cert.issuedAt).toLocaleDateString()}</span>
                  </div>
                </div>
                <Link 
                  to={`/certificate/${cert.id}`}
                  className="p-2 md:p-3 bg-green-900/20 text-green-500 rounded-sm hover:bg-green-500 hover:text-black transition-all shrink-0"
                >
                  <ExternalLink className="w-4 h-4 md:w-5 md:h-5" />
                </Link>
              </motion.div>
            )) : (
              <div className="py-8 md:py-12 text-center border border-dashed border-green-900/20 rounded-sm">
                <p className="text-gray-600 uppercase tracking-widest text-[10px] md:text-xs">NO_CERTIFICATIONS_ISSUED_YET</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CertificateView() {
  const { id } = useParams();
  const [cert, setCert] = useState<Certificate | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const unsubscribe = onSnapshot(doc(db, 'certificates', id), (doc) => {
      if (doc.exists()) {
        setCert(doc.data() as Certificate);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, [id]);

  if (loading) return <div className="min-h-screen bg-black flex items-center justify-center text-green-500 font-mono">RETRIEVING_CREDENTIALS...</div>;
  if (!cert) return <div className="min-h-screen bg-black flex items-center justify-center text-red-500 font-mono">CERTIFICATE_NOT_FOUND</div>;

  return (
    <div className="min-h-screen bg-zinc-900 p-4 md:p-12 flex items-center justify-center font-mono">
      <div className="max-w-4xl w-full bg-white text-black p-6 sm:p-12 md:p-20 relative border-[8px] md:border-[16px] border-double border-zinc-800 shadow-2xl overflow-hidden">
        {/* Decorative Background */}
        <div className="absolute inset-0 opacity-5 pointer-events-none flex items-center justify-center">
          <Shield className="w-[80%] h-[80%] text-zinc-900" />
        </div>

        <div className="relative z-10 space-y-8 md:space-y-12 text-center">
          <div className="space-y-4">
            <div className="flex justify-center mb-4 md:mb-8">
              <Shield className="w-12 h-12 md:w-20 md:h-20 text-green-600" />
            </div>
            <h1 className="text-2xl sm:text-4xl md:text-5xl font-black uppercase tracking-tighter border-b-2 md:border-b-4 border-black inline-block pb-2">Certificate of Completion</h1>
            <p className="text-sm md:text-xl italic font-serif">This is to certify that</p>
          </div>

          <div className="space-y-4">
            <h2 className="text-3xl sm:text-5xl md:text-6xl font-black uppercase tracking-tight underline decoration-green-500 decoration-2 md:decoration-4 underline-offset-4 md:underline-offset-8 break-words">{cert.studentName}</h2>
            <p className="text-sm md:text-xl italic font-serif">has successfully completed the professional module</p>
            <h3 className="text-xl sm:text-3xl md:text-4xl font-black uppercase tracking-tighter text-green-700">{cert.courseTitle}</h3>
          </div>

          <div className="pt-8 md:pt-12 grid grid-cols-1 sm:grid-cols-2 gap-8 md:gap-12 border-t border-zinc-200">
            <div className="space-y-2 text-left">
              <div className="text-[8px] md:text-[10px] uppercase font-bold text-zinc-400">Issue Date</div>
              <div className="text-sm md:text-lg font-bold">{new Date(cert.issuedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
            </div>
            <div className="space-y-2 text-right">
              <div className="text-[8px] md:text-[10px] uppercase font-bold text-zinc-400">Certificate Number</div>
              <div className="text-sm md:text-lg font-bold">{cert.certificateNumber}</div>
            </div>
          </div>

          <div className="pt-8 md:pt-12 flex flex-col sm:flex-row justify-between items-center gap-6">
            <div className="text-left space-y-4 order-2 sm:order-1">
              <div className="w-48 h-px bg-black hidden sm:block" />
              <div className="text-[8px] md:text-[10px] uppercase font-bold">HACKER KPK ADMINISTRATION</div>
            </div>
            <div className="flex gap-4 no-print order-1 sm:order-2">
              <button 
                onClick={() => window.print()}
                className="flex items-center gap-2 bg-zinc-900 text-white px-6 py-3 rounded-full font-bold hover:bg-zinc-800 transition-all text-xs"
              >
                <Printer className="w-4 h-4" /> PRINT_CREDENTIAL
              </button>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .min-h-screen { min-height: auto !important; padding: 0 !important; }
        }
      `}</style>
    </div>
  );
}

function AppContent() {
  const { loading } = useAuth();
  if (loading) return <div className="min-h-screen bg-black flex items-center justify-center text-green-500 font-mono">BOOTING_SYSTEM...</div>;

  return (
    <div className="min-h-screen bg-black flex flex-col">
      <Navbar />
      <div className="flex-1 flex flex-col">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/developer" element={<Developer />} />
          <Route path="/courses" element={<Courses />} />
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
          <Route path="/certificate/:id" element={<ProtectedRoute><CertificateView /></ProtectedRoute>} />
          <Route path="/course/:id" element={<ProtectedRoute><CourseView /></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute allowedRoles={['admin']}><Admin /></ProtectedRoute>} />
          <Route path="/teacher" element={<ProtectedRoute allowedRoles={['teacher']}><Teacher /></ProtectedRoute>} />
          <Route path="/teacher/course/:id" element={<ProtectedRoute allowedRoles={['teacher']}><CourseEditor /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </div>
      <Toaster position="bottom-right" theme="dark" />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <AppContent />
      </Router>
    </AuthProvider>
  );
}
