import React, { useState, useEffect } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { FaBars } from "react-icons/fa";
// Componentes comunes
import Login from "./components/common/Login";
import SetPassword from "./components/common/SetPassword";

// Componentes de estudiantes
import Sidebar from "./components/estudiante/Sidebar";
import Subir from "./components/estudiante/Subir";
import PensumVisual from "./components/estudiante/PensumVisual";

// Componentes de jefes
import SidebarJefe from "./components/jefe/SidebarJefe";

// Páginas de estudiantes
import Home from "./pages/estudiante/Home";
import InscribirAsignaturas from "./pages/estudiante/InscribirAsignaturas";
import ModificarMatricula from "./pages/estudiante/ModificarMatricula";
import ConsultarMatricula from "./pages/estudiante/ConsultarMatricula";
import DatosEstudiante from "./pages/estudiante/DatosEstudiante";

// Páginas de jefes
import HomeJefe from "./pages/jefe/HomeJefe";
import Plazos from "./pages/jefe/Plazos";
import VerificarDocumentos from "./pages/jefe/VerificarDocumentos";
import Modificaciones from "./pages/jefe/Modificaciones";
import DatosJefe from "./pages/jefe/DatosJefe";
import PlanDeEstudio from "./pages/jefe/PlanDeEstudio";
import { authService } from "./services/auth";
import ValidarSolicitudes from "./pages/jefe/ValidarSolicitudes";
import "./App.css";

const INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutos
const WARNING_BEFORE_MS = 60 * 1000; // Avisar 1 minuto antes

// Botón hamburguesa para móviles
const MobileMenuButton = ({ userRole, onToggle }) => {
  return (
    <button
      className="mobile-menu-button"
      onClick={onToggle}
      aria-label="Abrir menú"
    >
      <FaBars size={20} />
    </button>
  );
};

// Componente para proteger rutas
const ProtectedRoute = ({ children }) => {
  const isAuthenticated = authService.isAuthenticated();
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  
  return children;
};

// Rutas públicas restringidas: si ya hay sesión, redirige al home.
const PublicOnlyRoute = ({ children }) => {
  const isAuthenticated = authService.isAuthenticated();
  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }
  return children;
};

// Componente principal de la aplicación
function AppContent() {
  const [activePage, setActivePage] = useState("home");
  const [userRole, setUserRole] = useState(null);
  const [roleLoading, setRoleLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();
  const sidebarRef = React.useRef(null);
  const logoutTimerRef = React.useRef(null);
  const warningTimerRef = React.useRef(null);
  const countdownIntervalRef = React.useRef(null);
  const logoutDeadlineRef = React.useRef(null);
  const [showInactivityWarning, setShowInactivityWarning] = useState(false);
  const [warningSecondsLeft, setWarningSecondsLeft] = useState(60);
  const [showSessionExpiredNotice, setShowSessionExpiredNotice] = useState(false);

  // Cargar rol del usuario (al montar y cuando cambia la ruta)
  useEffect(() => {
    const loadUserRole = async () => {
      try {
        if (!authService.isAuthenticated()) {
          setUserRole(null);
          return;
        }

        setRoleLoading(true);

        // Primero intentar con el usuario en localStorage para evitar parpadeos
        const cachedUser = authService.getUser();
        if (cachedUser?.rol) {
          setUserRole(cachedUser.rol);
        }

        // Luego refrescar desde el servidor para asegurar datos actualizados
        const user = await authService.getCurrentUser();
        if (user) {
          authService.saveUser(user);
          setUserRole(user.rol || null);
        }
      } catch (error) {
        console.error("Error loading user role:", error);
        const cachedUser = authService.getUser();
        if (cachedUser?.rol) {
          setUserRole(cachedUser.rol || null);
        }
      } finally {
        setRoleLoading(false);
      }
    };

    loadUserRole();
  }, [location.pathname]);

  // Cierre de sesión por inactividad global.
  useEffect(() => {
    const clearTimers = () => {
      if (logoutTimerRef.current) {
        window.clearTimeout(logoutTimerRef.current);
        logoutTimerRef.current = null;
      }
      if (warningTimerRef.current) {
        window.clearTimeout(warningTimerRef.current);
        warningTimerRef.current = null;
      }
      if (countdownIntervalRef.current) {
        window.clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
      logoutDeadlineRef.current = null;
    };

    const closeWarningModal = () => {
      setShowInactivityWarning(false);
      setWarningSecondsLeft(60);
      if (countdownIntervalRef.current) {
        window.clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
    };

    const forceLogout = (showNotice = true) => {
      if (!authService.isAuthenticated()) return;
      closeWarningModal();
      authService.logout();
      setUserRole(null);
      if (showNotice) {
        setShowSessionExpiredNotice(true);
      }
      navigate("/login", { replace: true });
    };

    const startWarningCountdown = () => {
      if (!logoutDeadlineRef.current) return;
      closeWarningModal();
      setShowInactivityWarning(true);
      const updateCountdown = () => {
        if (!logoutDeadlineRef.current) return;
        const remainingMs = Math.max(logoutDeadlineRef.current - Date.now(), 0);
        setWarningSecondsLeft(Math.ceil(remainingMs / 1000));
      };
      updateCountdown();
      countdownIntervalRef.current = window.setInterval(updateCountdown, 1000);
    };

    const scheduleFromNow = () => {
      if (!authService.isAuthenticated()) {
        clearTimers();
        closeWarningModal();
        return;
      }

      authService.touchActivity();
      const now = Date.now();
      logoutDeadlineRef.current = now + INACTIVITY_TIMEOUT_MS;
      clearTimers();
      closeWarningModal();

      warningTimerRef.current = window.setTimeout(
        startWarningCountdown,
        INACTIVITY_TIMEOUT_MS - WARNING_BEFORE_MS
      );
      logoutTimerRef.current = window.setTimeout(() => forceLogout(true), INACTIVITY_TIMEOUT_MS);
    };

    const scheduleFromLastActivity = () => {
      if (!authService.isAuthenticated()) {
        clearTimers();
        closeWarningModal();
        return;
      }

      const lastActivity = authService.getLastActivity();
      const elapsed = lastActivity ? Date.now() - lastActivity : 0;
      const remaining = INACTIVITY_TIMEOUT_MS - elapsed;

      if (remaining <= 0) {
        forceLogout(true);
        return;
      }

      logoutDeadlineRef.current = Date.now() + remaining;
      clearTimers();
      closeWarningModal();

      if (remaining <= WARNING_BEFORE_MS) {
        startWarningCountdown();
      } else {
        warningTimerRef.current = window.setTimeout(
          startWarningCountdown,
          remaining - WARNING_BEFORE_MS
        );
      }
      logoutTimerRef.current = window.setTimeout(() => forceLogout(true), remaining);
    };

    const activityEvents = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "click"];
    activityEvents.forEach((eventName) => {
      window.addEventListener(eventName, scheduleFromNow, { passive: true });
    });

    const onStorage = (event) => {
      if (event.key === "token" && !event.newValue) {
        clearTimers();
        closeWarningModal();
        setUserRole(null);
        navigate("/login", { replace: true });
      }
      if (event.key === "lastActivityAt" && authService.isAuthenticated()) {
        scheduleFromLastActivity();
      }
    };
    window.addEventListener("storage", onStorage);

    scheduleFromLastActivity();

    return () => {
      clearTimers();
      closeWarningModal();
      activityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, scheduleFromNow);
      });
      window.removeEventListener("storage", onStorage);
    };
  }, [navigate, location.pathname]);

  // Sincronizar activePage con la ruta actual (agregar la nueva ruta)
  React.useEffect(() => {
    const path = location.pathname;
    if (path === "/" || path === "/home") {
      setActivePage("home");
    } else if (path === "/subir") {
      setActivePage("subir");
    } else if (path === "/hoja") {
      setActivePage("hoja");
    } else if (path === "/pensum") {
      setActivePage("pensum");
    } else if (path === "/inscribir") {
      setActivePage("inscribir");
    } else if (path === "/prueba") {
      setActivePage("Consultar");
    } else if (path === "/plazos") {
      setActivePage("plazos");
    } else if (path === "/verificar-documentos") {
      setActivePage("verificar-documentos");
    } else if (path === "/modificaciones") {
      setActivePage("modificar");
    } else if (path === "/modificar-matricula") {  // Nueva ruta
      setActivePage("modificar");
    } else if (path === "/plan-estudio") {
      setActivePage("plan-estudio");
    } else if (path === "/perfil") {
      setActivePage("perfil");
    } else if (path === "/validar-solicitudes") {
      setActivePage("validar-solicitudes");
    }
  }, [location]);

  // Hardening frente a bfcache (back/forward cache):
  // cuando la página vuelve del historial, revalida sesión y ruta pública/privada.
  useEffect(() => {
    const publicPaths = new Set(["/login", "/set-password"]);

    const enforceRouteBySession = () => {
      const isAuthenticated = authService.isAuthenticated();
      const isPublicPath = publicPaths.has(location.pathname);

      if (isAuthenticated && isPublicPath) {
        navigate("/", { replace: true });
        return;
      }
      if (!isAuthenticated && !isPublicPath) {
        navigate("/login", { replace: true });
      }
    };

    const onPageShow = () => {
      enforceRouteBySession();
    };

    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [navigate, location.pathname]);

  const handleLogout = () => {
    authService.logout();
    setShowInactivityWarning(false);
    setShowSessionExpiredNotice(false);
    navigate('/login');
  };

  const handleStaySignedIn = () => {
    setShowSessionExpiredNotice(false);
    authService.touchActivity();
  };

  const handlePageChange = (page) => {
    setActivePage(page);
    if (page === "home") {
      navigate("/");
    } else if (page === "modificar") {
      // Diferenciar entre estudiante y jefe
      if (userRole === "jefe_departamental") {
        navigate("/modificaciones");
      } else {
        navigate("/modificar-matricula");
      }
    } else if (page === "prueba") {
      navigate("/prueba");
    } else if (page === "Consultar") {
      navigate("/prueba");
    } else {
      navigate(`/${page}`);
    }
  };

  const renderRouteLoading = () => (
    <div className="route-loading">
      <div className="loading-spinner">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="32">
            <animate attributeName="stroke-dasharray" dur="2s" values="0 32;16 16;0 32;0 32" repeatCount="indefinite" />
            <animate attributeName="stroke-dashoffset" dur="2s" values="0;-16;-32;-32" repeatCount="indefinite" />
          </circle>
        </svg>
      </div>
    </div>
  );

  const renderRoleProtected = (element, predicate) => {
    if (roleLoading) {
      return renderRouteLoading();
    }
    return predicate() ? element : <Navigate to="/" replace />;
  };

  return (
    <>
    <Routes>
      {/* Rutas públicas */}
      <Route
        path="/login"
        element={
          <PublicOnlyRoute>
            <Login />
          </PublicOnlyRoute>
        }
      />
      <Route
        path="/set-password"
        element={
          <PublicOnlyRoute>
            <SetPassword />
          </PublicOnlyRoute>
        }
      />

      {/* Rutas protegidas */}
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            {roleLoading && authService.isAuthenticated() ? (
              <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center", background: "#e2e8f0" }}>
                <div className="loading-spinner">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 40, height: 40 }}>
                    <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="32">
                      <animate attributeName="stroke-dasharray" dur="2s" values="0 32;16 16;0 32;0 32" repeatCount="indefinite" />
                      <animate attributeName="stroke-dashoffset" dur="2s" values="0;-16;-32;-32" repeatCount="indefinite" />
                    </circle>
                  </svg>
                </div>
              </div>
            ) : (
            <div style={{ display: "flex", height: "100vh", background: "#e2e8f0", position: "relative", width: "100%" }}>
              {/* Backdrop overlay para sidebar en móviles */}
              <div className="sidebar-backdrop"></div>
              
              {/* Botón hamburguesa para móviles */}
              <MobileMenuButton 
                userRole={userRole}
                onToggle={() => {
                  // Usar el ref para sincronizar con el estado interno del sidebar
                  if (sidebarRef.current) {
                    sidebarRef.current.toggle();
                  }
                }}
              />
              
              {/* Mostrar Sidebar según el rol */}
              {userRole === "jefe_departamental" ? (
                <SidebarJefe 
                  ref={sidebarRef}
                  activePage={activePage} 
                  setActivePage={handlePageChange}
                  onLogout={handleLogout}
                />
              ) : (
                <Sidebar 
                  ref={sidebarRef}
                  activePage={activePage} 
                  setActivePage={handlePageChange}
                  onLogout={handleLogout}
                />
              )}
              <div className="main-content" style={{ width: "100%", padding: 0, overflowY: "auto", minHeight: "100vh", marginLeft: 0 }}>
                <Routes>
                  {/* Rutas para estudiantes */}
                  <Route
                    path="/"
                    element={
                      roleLoading
                        ? renderRouteLoading()
                        : userRole === "jefe_departamental"
                          ? <HomeJefe />
                          : <Home />
                    }
                  />
                  <Route
                    path="/home"
                    element={
                      roleLoading
                        ? renderRouteLoading()
                        : userRole === "jefe_departamental"
                          ? <HomeJefe />
                          : <Home />
                    }
                  />
                  <Route path="/subir" element={renderRoleProtected(<Subir />, () => userRole !== "jefe_departamental")} />
                  <Route path="/hoja" element={renderRoleProtected(<DatosEstudiante />, () => userRole !== "jefe_departamental")} />
                  <Route path="/pensum" element={renderRoleProtected(<PensumVisual />, () => userRole !== "jefe_departamental")} />
                  <Route path="/inscribir" element={renderRoleProtected(<InscribirAsignaturas />, () => userRole !== "jefe_departamental")} />
                  <Route path="/prueba" element={renderRoleProtected(<ConsultarMatricula />, () => userRole !== "jefe_departamental")} />
                  
                  {/* Nueva ruta para modificar matrícula del estudiante */}
                  <Route path="/modificar-matricula" element={renderRoleProtected(<ModificarMatricula />, () => userRole !== "jefe_departamental")} />
                  
                  <Route path="/plazos" element={renderRoleProtected(<Plazos />, () => userRole === "jefe_departamental")} />
                  <Route path="/verificar-documentos" element={renderRoleProtected(<VerificarDocumentos />, () => userRole === "jefe_departamental")} />
                  <Route
                    path="/modificaciones"
                    element={renderRoleProtected(<Modificaciones />, () => userRole === "jefe_departamental")}
                  />
                  <Route
                    path="/plan-estudio"
                    element={renderRoleProtected(<PlanDeEstudio />, () => userRole === "jefe_departamental")}
                  />
                  <Route
                    path="/perfil"
                    element={renderRoleProtected(<DatosJefe />, () => userRole === "jefe_departamental")}
                  />
                  <Route path="/validar-solicitudes" element={renderRoleProtected(<ValidarSolicitudes />, () => userRole === "jefe_departamental")} />
                  
                  <Route path="*" element={roleLoading ? renderRouteLoading() : <Navigate to="/" replace />} />
                </Routes>
              </div>
            </div>
            )}
          </ProtectedRoute>
        }
      />
    </Routes>
    {showInactivityWarning && authService.isAuthenticated() && (
      <div className="session-modal-overlay" role="presentation">
        <div className="session-modal" role="dialog" aria-modal="true" aria-labelledby="session-warning-title">
          <div className="session-modal-icon warning">!</div>
          <h2 id="session-warning-title" className="session-modal-title">Tu sesion esta por expirar</h2>
          <p className="session-modal-message">
            Por seguridad, tu sesion se cerrara en <strong>{warningSecondsLeft}</strong> segundos por inactividad.
          </p>
          <p className="session-modal-message secondary">
            Haz clic en "Seguir conectado" para mantener tu sesion activa.
          </p>
          <div className="session-modal-actions">
            <button className="session-btn secondary" onClick={handleLogout}>Cerrar sesion ahora</button>
            <button className="session-btn primary" onClick={handleStaySignedIn}>Seguir conectado</button>
          </div>
        </div>
      </div>
    )}
    {showSessionExpiredNotice && !authService.isAuthenticated() && (
      <div className="session-modal-overlay" role="presentation">
        <div className="session-modal" role="dialog" aria-modal="true" aria-labelledby="session-expired-title">
          <div className="session-modal-icon expired">i</div>
          <h2 id="session-expired-title" className="session-modal-title">Sesion cerrada por inactividad</h2>
          <p className="session-modal-message">
            Tu sesion se cerro automaticamente despues de 10 minutos sin actividad.
          </p>
          <p className="session-modal-message secondary">
            Inicia sesion nuevamente para continuar.
          </p>
          <div className="session-modal-actions center">
            <button className="session-btn primary" onClick={() => setShowSessionExpiredNotice(false)}>Entendido</button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

// Componente wrapper para App
function App() {
  return <AppContent />;
}

export default App;
