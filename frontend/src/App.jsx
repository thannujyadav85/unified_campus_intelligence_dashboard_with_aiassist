import React, { useState, useRef, useEffect } from 'react';

function TraceLogs({ steps }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div style={{ marginTop: '8px', width: '100%' }}>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-muted)', cursor: 'pointer', userSelect: 'none', padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-sidebar)', transition: 'all 0.2s' }}
        onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--primary)'}
        onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
      >
        <span>⚙️</span>
        <span style={{ fontWeight: '600' }}>{isOpen ? 'Hide Execution Steps' : 'View Backend Trace Logs'}</span>
        <span>{isOpen ? '▲' : '▼'}</span>
      </div>
      
      {isOpen && (
        <div 
          className="animate-slide-up"
          style={{ marginTop: '8px', padding: '12px 16px', borderRadius: '10px', border: '1px solid var(--border-color)', backgroundColor: '#090b11', color: '#38bdf8', fontFamily: 'var(--font-mono)', fontSize: '12px', lineHeight: '1.6', display: 'flex', flexDirection: 'column', gap: '6px', overflowX: 'auto', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.8)' }}
        >
          {steps.map((step, sIdx) => {
            let color = '#38bdf8'; // Default sky blue
            if (step.includes('❌') || step.includes('CRASH')) color = '#f87171'; // Red for error/crash
            else if (step.includes('✅') || step.includes('Completed')) color = '#4ade80'; // Green for complete
            else if (step.includes('⚡') || step.includes('Tool Call')) color = '#fbbf24'; // Orange/yellow for tool call
            else if (step.includes('🔗') || step.includes('Exploring')) color = '#c084fc'; // Purple for exploring link
            else if (step.includes('🧠') || step.includes('Analyzing')) color = '#fb7185'; // Pink for analyzing
            
            return (
              <div key={sIdx} style={{ color, display: 'flex', gap: '8px', whiteSpace: 'pre-wrap' }}>
                <span>{step}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function CampusDashboard() {
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [userRole, setUserRole] = useState(null); // 'student' or 'admin'
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth <= 768;
      setIsMobile(mobile);
      if (!mobile) {
        setShowMobileSidebar(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Student context profile to persist context (e.g. UG, B.Tech, MBA)
  const [studentProfile, setStudentProfile] = useState({
    program: 'UG / B.Tech',
    year: '2026',
    department: 'Computer Science'
  });
  const [showProfileModal, setShowProfileModal] = useState(false);

  const messageEndRef = useRef(null);

  // Auto-scroll chat window to bottom on new messages
  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSubmit = async (e, customQuery = '') => {
    if (e) e.preventDefault();
    const activeQuery = customQuery || query;
    if (!activeQuery.trim()) return;

    // Close mobile sidebar drawer if it was opened
    setShowMobileSidebar(false);

    // Append user query to chat history
    const userMessage = { role: 'user', content: activeQuery };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setQuery('');
    setIsLoading(true);
    setError('');

    // Format chat history payload to send to Gemini API
    const historyPayload = messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));

    try {
      const apiBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const res = await fetch(`${apiBaseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          prompt: activeQuery,
          history: historyPayload,
          role: userRole
        }),
      });

      if (!res.ok) {
        throw new Error(`Server returned error status: ${res.status}`);
      }

      const data = await res.json();
      if (data.status === 'success') {
        setMessages([...updatedMessages, { role: 'model', content: data.reply, steps: data.steps || [] }]);
      } else {
        throw new Error('Unexpected database payload format.');
      }
    } catch (err) {
      setError(err.message || 'Failed to connect to the campus AI backend.');
    } finally {
      setIsLoading(false);
    }
  };

  // Helper to format responses into rich text (handles bold, code snippets, lists, and links)
  const formatResponse = (text) => {
    if (!text) return null;
    return text.split('\n').map((line, idx) => {
      let formattedLine = line;

      // Handle raw markdown bold strings **text**
      const boldRegex = /\*\*(.*?)\*\"/g;
      const parts = [];
      let lastIndex = 0;
      let match;

      // Simple markdown bold parsing helper
      const boldMatches = [...formattedLine.matchAll(/\*\*(.*?)\*\*/g)];
      if (boldMatches.length > 0) {
        let currentPos = 0;
        boldMatches.forEach((m, mIdx) => {
          if (m.index > currentPos) {
            parts.push(formattedLine.substring(currentPos, m.index));
          }
          parts.push(<strong key={mIdx} style={{ color: 'var(--text-heading)', fontWeight: '600' }}>{m[1]}</strong>);
          currentPos = m.index + m[0].length;
        });
        if (currentPos < formattedLine.length) {
          parts.push(formattedLine.substring(currentPos));
        }
      }

      const content = parts.length > 0 ? parts : formattedLine;

      // Detect header lists (e.g. 1. Title or - Title)
      if (line.trim().startsWith('📍') || line.trim().startsWith('📍')) {
        return (
          <div key={idx} style={{ margin: '8px 0', display: 'flex', gap: '8px', alignItems: 'flex-start', color: 'var(--accent)' }}>
            <span>📍</span>
            <span style={{ color: 'var(--text-main)' }}>{line.replace(/^📍/, '').trim()}</span>
          </div>
        );
      }

      if (line.trim().startsWith('🔗')) {
        const urlMatch = line.match(/(https?:\/\/[^\s]+)/g);
        if (urlMatch) {
          return (
            <div key={idx} style={{ margin: '8px 0' }}>
              <a 
                href={urlMatch[0]} 
                target="_blank" 
                rel="noreferrer" 
                style={{ color: 'var(--accent)', textDecoration: 'none', borderBottom: '1px dashed var(--accent)', paddingBottom: '2px' }}
              >
                🔗 View Live Calendar Document
              </a>
            </div>
          );
        }
      }

      return (
        <p key={idx} style={{ margin: '6px 0', minHeight: '18px' }}>
          {content}
        </p>
      );
    });
  };

  const suggestionChips = [
    { label: "📅 Next Sem Physical Registration Date", query: "can i know when is the physical registration for next sem" },
    { label: "🍳 Monday Cafeteria Menu", query: "what is on the cafeteria menu for Monday?" },
    { label: "🏆 Campus Events Calendar", query: "show me all upcoming events" },
    { label: "📚 Search: Linear Algebra books", query: "search library for 'linear algebra'" }
  ];

  if (!userRole) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: 'var(--bg-app)', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-main)', padding: '20px', boxSizing: 'border-box' }}>
        <div style={{ width: '100%', maxWidth: '600px', padding: isMobile ? '24px' : '40px', boxSizing: 'border-box', backgroundColor: 'var(--bg-card)', borderRadius: '24px', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-lg)', textAlign: 'center' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '16px', backgroundColor: 'var(--primary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold', fontSize: '32px', marginBottom: '24px' }}>I</div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: '700', fontSize: isMobile ? '24px' : '32px', color: 'var(--text-heading)', margin: '0 0 8px' }}>IITR Campus AI Gateway</h1>
          <p style={{ fontSize: '15px', color: 'var(--text-muted)', marginBottom: '36px' }}>Select your login profile to access campus services</p>
          
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '20px' }}>
            <div 
              onClick={() => setUserRole('student')}
              style={{ padding: '24px', borderRadius: '16px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', cursor: 'pointer', textAlign: 'center', transition: 'all 0.2s' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--primary)';
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-color)';
                e.currentTarget.style.transform = 'none';
              }}
            >
              <div style={{ fontSize: '36px', marginBottom: '12px' }}>🎓</div>
              <div style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text-heading)', marginBottom: '6px' }}>Student Portal</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Query deadlines, calendar milestones, check cafeteria menus, and search books.</div>
            </div>
            
            <div 
              onClick={() => setUserRole('admin')}
              style={{ padding: '24px', borderRadius: '16px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', cursor: 'pointer', textAlign: 'center', transition: 'all 0.2s' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--primary)';
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-color)';
                e.currentTarget.style.transform = 'none';
              }}
            >
              <div style={{ fontSize: '36px', marginBottom: '12px' }}>🛡️</div>
              <div style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text-heading)', marginBottom: '6px' }}>Admin Console</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Full admin access. Modify cafeteria menus, submit campus events, and manage catalog data.</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Sidebar JSX content extracted to reusable helper
  const sidebarContent = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '24px 20px', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold', fontSize: '18px' }}>I</div>
          <span style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-heading)', fontFamily: 'var(--font-display)', letterSpacing: '0.5px' }}>IITR CAMPUS AI</span>
        </div>
        {isMobile && (
          <button 
            onClick={() => setShowMobileSidebar(false)}
            style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px' }}
          >
            ✕
          </button>
        )}
      </div>

      <button 
        onClick={() => {
          setMessages([]);
          setShowMobileSidebar(false);
        }} 
        style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-heading)', fontSize: '14px', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', transition: 'all 0.2s', marginBottom: '24px' }}
      >
        <span>💬</span> New Conversation
      </button>

      {/* Profile Card Context */}
      <div style={{ marginTop: 'auto', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)', background: 'var(--bg-card)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)' }}>STUDENT CONTEXT</span>
          <button 
            onClick={() => {
              setShowProfileModal(true);
              setShowMobileSidebar(false);
            }} 
            style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}
          >
            Edit
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
            <span style={{ color: 'var(--text-muted)' }}>Program:</span>
            <strong style={{ color: 'var(--text-heading)' }}>{studentProfile.program}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
            <span style={{ color: 'var(--text-muted)' }}>Year:</span>
            <strong style={{ color: 'var(--text-heading)' }}>{studentProfile.year}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
            <span style={{ color: 'var(--text-muted)' }}>Major:</span>
            <strong style={{ color: 'var(--text-heading)' }}>{studentProfile.department}</strong>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', height: '100vh', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)', fontFamily: 'var(--font-main)', overflow: 'hidden' }}>
      
      {/* Sidebar - Desktop static layout */}
      {!isMobile && (
        <div style={{ width: '280px', flexShrink: 0, borderRight: '1px solid var(--border-color)', backgroundColor: 'var(--bg-sidebar)' }}>
          {sidebarContent}
        </div>
      )}

      {/* Sidebar Drawer overlay - Mobile view */}
      {isMobile && (
        <>
          {/* Transparent Backdrop overlay */}
          <div 
            onClick={() => setShowMobileSidebar(false)}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.4)',
              zIndex: 999,
              opacity: showMobileSidebar ? 1 : 0,
              visibility: showMobileSidebar ? 'visible' : 'hidden',
              transition: 'opacity 0.3s ease, visibility 0.3s ease'
            }}
          />
          {/* Floating Drawer Container */}
          <div 
            style={{
              position: 'fixed',
              top: 0,
              left: showMobileSidebar ? 0 : '-280px',
              width: '280px',
              height: '100%',
              backgroundColor: 'var(--bg-sidebar)',
              borderRight: '1px solid var(--border-color)',
              boxShadow: 'var(--shadow-lg)',
              zIndex: 1000,
              transition: 'left 0.3s ease-out'
            }}
          >
            {sidebarContent}
          </div>
        </>
      )}

      {/* Main Chat Hub Container */}
      <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        {/* Top Status Header */}
        <header style={{ height: '64px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', padding: isMobile ? '0 16px' : '0 24px', justifyContent: 'space-between', backgroundColor: 'var(--bg-card)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {isMobile && (
              <button 
                onClick={() => setShowMobileSidebar(!showMobileSidebar)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                  color: 'var(--text-heading)',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                ☰
              </button>
            )}
            {!isMobile && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981', boxShadow: '0 0 8px #10b981' }}></div>
                <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-muted)' }}>IITR Gateway Server: Connected</span>
              </div>
            )}
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '13px', fontWeight: '600', padding: '6px 12px', borderRadius: '20px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-sidebar)', color: 'var(--text-heading)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              {userRole === 'admin' ? '🛡️ Admin' : '🎓 Student'}
            </span>
            <button 
              onClick={() => {
                setUserRole(null);
                setMessages([]);
              }}
              style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '13px', fontWeight: '600', transition: 'all 0.2s' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--primary)';
                e.currentTarget.style.borderColor = 'var(--primary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--text-muted)';
                e.currentTarget.style.borderColor = 'var(--border-color)';
              }}
            >
              Switch Profile
            </button>
          </div>
        </header>

        {/* Messaging Board Area */}
        <div style={{ flexGrow: 1, overflowY: 'auto', padding: isMobile ? '20px 16px' : '32px 24px', boxSizing: 'border-box' }}>
          <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            {messages.length === 0 ? (
              // Empty/Welcome Landing state
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginTop: isMobile ? '10px' : '40px' }} className="animate-slide-up">
                <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: '700', fontSize: isMobile ? '28px' : '40px', color: 'var(--text-heading)', margin: '0 0 12px' }}>
                  Hello, student!
                </h1>
                <p style={{ fontSize: isMobile ? '15px' : '18px', color: 'var(--text-muted)', marginBottom: '32px', maxWidth: '600px' }}>
                  How can I help you navigate IIT Roorkee calendar deadlines, cafeteria menu updates, library lookups, or events today?
                </p>

                {/* Suggestions Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px', width: '100%', maxWidth: '720px' }}>
                  {suggestionChips.map((chip, idx) => (
                    <div 
                      key={idx}
                      onClick={(e) => handleSubmit(e, chip.query)}
                      style={{ padding: '20px', borderRadius: '16px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', textAlign: 'left', cursor: 'pointer', transition: 'transform 0.2s, box-shadow 0.2s' }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-2px)';
                        e.currentTarget.style.borderColor = 'var(--primary)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'none';
                        e.currentTarget.style.borderColor = 'var(--border-color)';
                      }}
                    >
                      <div style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text-heading)', marginBottom: '6px' }}>{chip.label}</div>
                      <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>"{chip.query}"</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              // Dynamic message history
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                {messages.map((msg, idx) => (
                  <div 
                    key={idx} 
                    style={{ 
                      display: 'flex', 
                      flexDirection: 'column',
                      alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                      width: '100%',
                      animation: 'slideUp 0.3s ease-out'
                    }}
                  >
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '4px', fontSize: '12px', color: 'var(--text-muted)', width: '100%', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                      <span>{msg.role === 'user' ? 'You' : 'Smart Assistant'}</span>
                    </div>
                    <div 
                      style={{ 
                        maxWidth: isMobile ? '95%' : '85%',
                        padding: '16px 20px',
                        borderRadius: msg.role === 'user' ? '18px 18px 2px 18px' : '18px 18px 18px 2px',
                        backgroundColor: msg.role === 'user' ? 'var(--primary)' : 'var(--bg-card)',
                        color: msg.role === 'user' ? 'white' : 'var(--text-main)',
                        border: msg.role === 'user' ? 'none' : '1px solid var(--border-color)',
                        fontSize: '15px',
                        lineHeight: '1.6',
                        whiteSpace: 'pre-wrap',
                        boxShadow: 'var(--shadow-sm)'
                      }}
                    >
                      {msg.role === 'user' ? msg.content : formatResponse(msg.content)}
                    </div>
                    {msg.role === 'model' && msg.steps && msg.steps.length > 0 && (
                      <TraceLogs steps={msg.steps} />
                    )}
                  </div>
                ))}

                {isLoading && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', width: '100%' }}>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '4px', fontSize: '12px', color: 'var(--text-muted)' }}>
                      <span>Assistant is thinking...</span>
                    </div>
                    <div 
                      style={{ 
                        padding: '16px 20px',
                        borderRadius: '18px 18px 18px 2px',
                        backgroundColor: 'var(--bg-card)',
                        border: '1px solid var(--border-color)',
                        width: '120px',
                        display: 'flex',
                        gap: '6px',
                        justifyContent: 'center'
                      }}
                    >
                      <div className="animate-pulse" style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--primary)' }}></div>
                      <div className="animate-pulse" style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--primary)', animationDelay: '0.2s' }}></div>
                      <div className="animate-pulse" style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--primary)', animationDelay: '0.4s' }}></div>
                    </div>
                  </div>
                )}

                {error && (
                  <div style={{ padding: '16px', borderRadius: '12px', backgroundColor: '#fef2f2', border: '1px solid #fee2e2', color: '#ef4444', fontSize: '14px', alignSelf: 'center', maxWidth: '600px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span>⚠️</span> <strong>Error:</strong> {error}
                  </div>
                )}

                <div ref={messageEndRef} />
              </div>
            )}
          </div>
        </div>

        {/* Input Floating Panel Area */}
        <div style={{ padding: isMobile ? '12px 16px 20px' : '16px 24px 32px', boxSizing: 'border-box', flexShrink: 0 }}>
          <div style={{ maxWidth: '800px', margin: '0 auto', position: 'relative' }}>
            <form onSubmit={handleSubmit} style={{ width: '100%', display: 'flex', position: 'relative', borderRadius: '24px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', overflow: 'hidden', boxShadow: 'var(--shadow-md)', transition: 'border-color 0.2s' }}
              onFocus={(e) => e.currentTarget.style.borderColor = 'var(--primary)'}
              onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
            >
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ask campus intelligence..."
                disabled={isLoading}
                style={{ flexGrow: 1, border: 'none', outline: 'none', backgroundColor: 'transparent', padding: isMobile ? '14px 18px' : '18px 24px', fontSize: isMobile ? '14px' : '16px', color: 'var(--text-heading)' }}
              />
              <button 
                type="submit" 
                disabled={isLoading || !query.trim()}
                style={{ border: 'none', background: 'none', padding: isMobile ? '0 16px' : '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: query.trim() ? 'pointer' : 'default', fontSize: '20px', color: query.trim() ? 'var(--primary)' : 'var(--text-muted)', transition: 'color 0.2s' }}
              >
                ➔
              </button>
            </form>
            <div style={{ textAlign: 'center', fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>
              IIT Roorkee Smart Campus Agent | Profile: {studentProfile.program} ({studentProfile.year})
            </div>
          </div>
        </div>
      </div>

      {/* Edit Profile Context Modal */}
      {showProfileModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ width: '100%', maxWidth: '400px', padding: '28px', borderRadius: '16px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', boxShadow: 'var(--shadow-lg)', boxSizing: 'border-box' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-heading)', margin: '0 0 16px', fontFamily: 'var(--font-display)' }}>Update Student Context Profile</h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '6px' }}>Program / Track</label>
                <select 
                  value={studentProfile.program} 
                  onChange={(e) => setStudentProfile({ ...studentProfile, program: e.target.value })}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-heading)', fontSize: '14px' }}
                >
                  <option value="UG / B.Tech">UG / B.Tech (Regular)</option>
                  <option value="PG / M.Tech">PG / M.Tech (Regular)</option>
                  <option value="MBA">MBA Programme</option>
                  <option value="PhD">Ph.D. Scholar</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '6px' }}>Academic Cycle Year</label>
                <input 
                  type="text" 
                  value={studentProfile.year} 
                  onChange={(e) => setStudentProfile({ ...studentProfile, year: e.target.value })}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-heading)', fontSize: '14px', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '6px' }}>Major Department</label>
                <input 
                  type="text" 
                  value={studentProfile.department} 
                  onChange={(e) => setStudentProfile({ ...studentProfile, department: e.target.value })}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-heading)', fontSize: '14px', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button 
                onClick={() => setShowProfileModal(false)}
                style={{ padding: '10px 16px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'transparent', color: 'var(--text-heading)', cursor: 'pointer', fontSize: '14px', fontWeight: '500' }}
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  setShowProfileModal(false);
                  // Push context hint directly into chat thread to update assistant
                  setMessages([
                    ...messages,
                    { role: 'user', content: `[SYSTEM PROFILE PROFILE HINT]: Update my student profile context. I am a student of ${studentProfile.program} program, Year: ${studentProfile.year}, Department: ${studentProfile.department}.` },
                    { role: 'model', content: `Profile Updated: I have updated your context. Future queries will automatically resolve with respect to your ${studentProfile.program} program and academic calendar cycle.` }
                  ]);
                }}
                style={{ padding: '10px 16px', borderRadius: '8px', border: 'none', backgroundColor: 'var(--primary)', color: 'white', cursor: 'pointer', fontSize: '14px', fontWeight: '500' }}
              >
                Save & Contextualize
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}