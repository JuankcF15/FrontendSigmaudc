import React, { useState, useEffect, useCallback } from "react";
import { matriculaService } from "../../services/matricula";
import HorarioGrid from "../../components/common/HorarioGrid";
import "../../styles/ValidarSolicitudes.css";
import {
  FaCheckCircle,
  FaTimesCircle,
  FaSpinner,
  FaClipboardList,
  FaUser,
  FaPlus,
  FaMinus,
  FaExclamationTriangle,
  FaClock,
} from "react-icons/fa";

const DIAS_SEMANA = ["LUNES", "MARTES", "MIERCOLES", "JUEVES", "VIERNES", "SABADO"];
const HORAS = Array.from({ length: 14 }, (_, i) => 7 + i);

const COLOR_HORARIO = {
  agregar: "#34c759",
  retirar: "#ff3b30",
  mantener: "#c7c7cc",
};

const parseJsonArray = (val) => {
  if (Array.isArray(val)) return val;
  if (typeof val === "string") {
    try {
      return JSON.parse(val);
    } catch {
      return [];
    }
  }
  return [];
};

const materiaToEntry = (m) => ({
  asignatura: m.nombre,
  codigo: m.codigo,
  grupoCodigo: m.grupo_codigo,
  docente: m.docente,
  horarios: m.horarios || [],
});

const buildHorarioUnificado = (vistaPrevia) => {
  if (!vistaPrevia) return [];
  const retirarIds = new Set((vistaPrevia.materias_retiradas || []).map((m) => m.grupo_id));
  const entries = [];

  (vistaPrevia.matricula_actual || []).forEach((m) => {
    if (retirarIds.has(m.grupo_id)) {
      entries.push({ ...materiaToEntry(m), cambio: "retirar", color: COLOR_HORARIO.retirar });
    }
  });

  (vistaPrevia.matricula_proyectada || []).forEach((m) => {
    const agregar = m.cambio === "agregar";
    entries.push({
      ...materiaToEntry(m),
      cambio: agregar ? "agregar" : "mantener",
      color: agregar ? COLOR_HORARIO.agregar : COLOR_HORARIO.mantener,
    });
  });

  return entries;
};

const ValidarSolicitudes = () => {
  const [solicitudes, setSolicitudes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [procesando, setProcesando] = useState({});
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({
    page: 1,
    page_size: 25,
    total_items: 0,
    total_pages: 0,
    has_next: false,
    has_prev: false,
  });

  useEffect(() => {
    loadSolicitudes();
  }, [filtroEstado, page]);

  useEffect(() => {
    const unsubscribe = matriculaService.subscribeModificacionesEvents({
      onMessage: (event) => {
        if (event?.event_type === "solicitud_actualizada" || event?.event_type === "cupos_actualizados") {
          if (page !== 1) {
            setPage(1);
          } else {
            loadSolicitudes();
          }
        }
      },
    });

    return () => unsubscribe();
  }, [filtroEstado, page]);

  const loadSolicitudes = async () => {
    try {
      setLoading(true);
      const response = await matriculaService.getSolicitudesPorPrograma({
        estado: filtroEstado === "todos" ? undefined : filtroEstado,
        page,
        page_size: 25,
      });
      if (Array.isArray(response)) {
        setSolicitudes(response || []);
        setPagination({
          page: 1,
          page_size: response.length,
          total_items: response.length,
          total_pages: 1,
          has_next: false,
          has_prev: false,
        });
      } else {
        setSolicitudes(response?.items || []);
        setPagination(response?.pagination || {
          page: 1,
          page_size: 25,
          total_items: 0,
          total_pages: 0,
          has_next: false,
          has_prev: false,
        });
      }
      setError(null);
    } catch (err) {
      console.error("Error loading solicitudes:", err);
      setError(err.response?.data?.error || "Error al cargar solicitudes");
    } finally {
      setLoading(false);
    }
  };

  const handleValidar = async (solicitudId, estado, observacion) => {
    try {
      setProcesando((prev) => ({ ...prev, [solicitudId]: true }));
      setError(null);
      setSuccess(null);

      await matriculaService.validarSolicitud(solicitudId, estado, observacion);
      const nowISO = new Date().toISOString();

      // Actualización local inmediata para evitar recargar la página.
      setSolicitudes((prev) =>
        prev.map((sol) =>
          sol.id === solicitudId
            ? {
                ...sol,
                estado,
                observacion: estado === "rechazada" ? observacion : "",
                fecha_revision: nowISO,
              }
            : sol
        )
      );

      setSuccess(
        `Solicitud ${estado === "aprobada" ? "aprobada" : "rechazada"} exitosamente`
      );

      // Limpiar mensaje de éxito después de 3 segundos
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error("Error validando solicitud:", err);
      setError(err.response?.data?.error || "Error al validar solicitud");
    } finally {
      setProcesando((prev) => ({ ...prev, [solicitudId]: false }));
    }
  };

  const solicitudesFiltradas = solicitudes;

  // Agrupar solicitudes por estudiante
  const solicitudesPorEstudiante = {};
  solicitudesFiltradas.forEach((sol) => {
    const key = `${sol.estudiante_codigo || sol.estudiante_id}`;
    if (!solicitudesPorEstudiante[key]) {
      solicitudesPorEstudiante[key] = {
        estudiante: {
          codigo: sol.estudiante_codigo || `ID: ${sol.estudiante_id}`,
          nombre: sol.estudiante_nombre || "Sin nombre",
          apellido: sol.estudiante_apellido || "",
        },
        solicitudes: [],
      };
    }
    solicitudesPorEstudiante[key].solicitudes.push(sol);
  });

  if (loading) {
    return (
      <div className="validar-solicitudes-container">
        <div className="loading-container">
          <FaSpinner className="spinner" />
          <p>Cargando solicitudes...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="validar-solicitudes-container">
      <div className="validar-header">
        <div className="header-logo-title">
          <div className="udc-logo-container">
            <img 
              src="/logo-udc.png" 
              alt="Logo Universidad" 
              className="udc-logo"
            />
          </div>
          <div>
            <h1 className="page-title">Validar Solicitudes de Modificación</h1>
            <p className="page-subtitle">
              Revisa cómo quedaría la matrícula del estudiante antes de aprobar o rechazar cada solicitud
            </p>
          </div>
        </div>

        {/* Filtro de estado */}
        <div className="filtros">
          <label className="filtro-label">Filtrar por estado:</label>
          <select
            className="filtro-select"
            value={filtroEstado}
            onChange={(e) => {
              setFiltroEstado(e.target.value);
              setPage(1);
            }}
          >
            <option value="todos">Todos</option>
            <option value="pendiente">Pendientes</option>
            <option value="aprobada">Aprobadas</option>
            <option value="rechazada">Rechazadas</option>
          </select>
        </div>
      </div>

      {/* Mensajes de estado */}
      {error && (
        <div className="alert-error">
          <FaTimesCircle />
          <p>{error}</p>
        </div>
      )}
      {success && (
        <div className="alert-success">
          <FaCheckCircle />
          <p>{success}</p>
        </div>
      )}

      {/* Lista de solicitudes */}
      {solicitudesFiltradas.length === 0 ? (
        <div className="empty-state">
          <FaClipboardList size={48} />
          <p>No hay solicitudes para mostrar</p>
        </div>
      ) : (
        <div className="solicitudes-grid">
          {Object.values(solicitudesPorEstudiante).map((grupo, idx) => (
            <div key={idx} className="estudiante-card">
              <div className="estudiante-header">
                <div className="estudiante-info">
                  <FaUser />
                  <div>
                    <h3>
                      {grupo.estudiante.nombre} {grupo.estudiante.apellido}
                    </h3>
                    <p className="estudiante-codigo">
                      Código: {grupo.estudiante.codigo || `ID: ${grupo.solicitudes[0]?.estudiante_id || 'N/A'}`}
                    </p>
                  </div>
                </div>
              </div>

              <div className="solicitudes-list">
                {grupo.solicitudes.map((sol) => (
                  <SolicitudCard
                    key={sol.id}
                    solicitud={sol}
                    onValidar={handleValidar}
                    procesando={procesando[sol.id] || false}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {pagination.total_pages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", gap: "0.75rem", marginTop: "1.25rem" }}>
          <button
            className="btn-review"
            onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
            disabled={!pagination.has_prev || loading}
          >
            Anterior
          </button>
          <span style={{ alignSelf: "center" }}>
            Página {pagination.page} de {pagination.total_pages}
          </span>
          <button
            className="btn-review"
            onClick={() => setPage((prev) => prev + 1)}
            disabled={!pagination.has_next || loading}
          >
            Siguiente
          </button>
        </div>
      )}
    </div>
  );
};

const SolicitudCard = ({ solicitud, onValidar, procesando }) => {
  const [mostrarRevision, setMostrarRevision] = useState(false);
  const [observacion, setObservacion] = useState("");
  const [vistaPrevia, setVistaPrevia] = useState(null);
  const [cargandoPreview, setCargandoPreview] = useState(false);
  const [errorPreview, setErrorPreview] = useState(null);

  const gruposAAgregar = parseJsonArray(solicitud.grupos_agregar);
  const gruposARetirar = parseJsonArray(solicitud.grupos_retirar);

  const cargarVistaPrevia = useCallback(async () => {
    try {
      setCargandoPreview(true);
      setErrorPreview(null);
      const data = await matriculaService.getSolicitudVistaPrevia(solicitud.id);
      setVistaPrevia(data);
    } catch (err) {
      console.error("Error cargando vista previa:", err);
      setErrorPreview(
        err.response?.data?.error ||
          err.response?.data ||
          "No se pudo cargar la vista previa de la matrícula"
      );
      setVistaPrevia(null);
    } finally {
      setCargandoPreview(false);
    }
  }, [solicitud.id]);

  useEffect(() => {
    if (mostrarRevision && !vistaPrevia && !cargandoPreview && !errorPreview) {
      cargarVistaPrevia();
    }
  }, [mostrarRevision, vistaPrevia, cargandoPreview, errorPreview, cargarVistaPrevia]);

  const toggleRevision = () => {
    if (mostrarRevision) {
      setMostrarRevision(false);
      setObservacion("");
    } else {
      setMostrarRevision(true);
    }
  };

  const getEstadoBadge = () => {
    if (solicitud.estado === "aprobada") {
      return (
        <span className="badge badge-success">
          <FaCheckCircle /> Aprobada
        </span>
      );
    }
    if (solicitud.estado === "pendiente") {
      return (
        <span className="badge badge-warning">
          <FaClock /> Pendiente
        </span>
      );
    }
    if (solicitud.estado === "rechazada") {
      return (
        <span className="badge badge-error">
          <FaTimesCircle /> Rechazada
        </span>
      );
    }
    return null;
  };

  const handleAprobar = () => {
    if (vistaPrevia && !vistaPrevia.puede_aprobar) {
      const confirmar = window.confirm(
        "Esta solicitud tiene advertencias (conflictos de horario, créditos, cupos, etc.). ¿Deseas aprobarla de todas formas?"
      );
      if (!confirmar) return;
    }
    onValidar(solicitud.id, "aprobada", "");
    setMostrarRevision(false);
    setObservacion("");
    setVistaPrevia(null);
  };

  const handleRechazar = () => {
    if (!observacion.trim()) {
      alert("La observación es obligatoria al rechazar una solicitud");
      return;
    }
    onValidar(solicitud.id, "rechazada", observacion.trim());
    setMostrarRevision(false);
    setObservacion("");
    setVistaPrevia(null);
  };

  const creditos = vistaPrevia?.creditos;
  const periodoLabel = vistaPrevia?.periodo
    ? `${vistaPrevia.periodo.year}-${vistaPrevia.periodo.semestre}`
    : null;

  return (
    <div className={`solicitud-card ${solicitud.estado}`}>
      <div className="solicitud-header">
        <div>
          <h4>Solicitud de modificación</h4>
          <p className="solicitud-fecha">
            {new Date(solicitud.fecha_solicitud).toLocaleDateString("es-ES", {
              day: "numeric",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
        {getEstadoBadge()}
      </div>

      {!mostrarRevision && (gruposAAgregar.length > 0 || gruposARetirar.length > 0) && (
        <ul className="cambios-resumen">
          {gruposAAgregar.map((g, i) => (
            <li key={`a-${i}`} className="cambio-linea agregar">
              <FaPlus /> {g.asignatura_codigo || g.asignatura_nombre} · Gr. {g.grupo_codigo}
            </li>
          ))}
          {gruposARetirar.map((g, i) => (
            <li key={`r-${i}`} className="cambio-linea retirar">
              <FaMinus /> {g.asignatura_codigo || g.asignatura_nombre} · Gr. {g.grupo_codigo}
            </li>
          ))}
        </ul>
      )}

      {solicitud.estado === "rechazada" && solicitud.observacion && (
        <div className="observacion-box">
          <strong>Observación:</strong>{" "}
          {typeof solicitud.observacion === "string" ? solicitud.observacion : ""}
        </div>
      )}

      <div className="solicitud-actions">
        <button
          className="btn-review"
          onClick={toggleRevision}
          disabled={procesando}
        >
          {mostrarRevision
            ? "Cerrar"
            : solicitud.estado === "pendiente"
              ? "Revisar"
              : "Ver detalle"}
        </button>
      </div>

      {mostrarRevision && (
        <div className="review-panel">
          {cargandoPreview && (
            <div className="preview-loading">
              <FaSpinner className="spinner-small" />
              <span>Cargando vista previa…</span>
            </div>
          )}

          {errorPreview && (
            <div className="alert-error preview-error">
              <FaExclamationTriangle />
              <p>{typeof errorPreview === "string" ? errorPreview : "Error al cargar vista previa"}</p>
              <button type="button" className="btn-link" onClick={cargarVistaPrevia}>
                Reintentar
              </button>
            </div>
          )}

          {vistaPrevia && !cargandoPreview && (
            <>
              <p className="preview-meta">
                {[
                  periodoLabel && `Periodo ${periodoLabel}`,
                  vistaPrevia.estudiante?.semestre != null &&
                    `Semestre ${vistaPrevia.estudiante.semestre}`,
                  creditos &&
                    `${creditos.inscritos_actual} → ${creditos.inscritos_proyectado} cr (máx. ${creditos.maximo})`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>

              {vistaPrevia.advertencias?.length > 0 && (
                <div className="preview-alerta">
                  <FaExclamationTriangle />
                  <p>{vistaPrevia.advertencias[0]}</p>
                  {vistaPrevia.advertencias.length > 1 && (
                    <details className="alerta-mas">
                      <summary>{vistaPrevia.advertencias.length - 1} advertencia(s) más</summary>
                      <ul>
                        {vistaPrevia.advertencias.slice(1).map((adv, i) => (
                          <li key={i}>{adv}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              )}

              <div className="preview-horario-section">
                <div className="horario-leyenda">
                  <span><i className="leyenda-dot agregar" /> Agrega</span>
                  <span><i className="leyenda-dot retirar" /> Retira</span>
                  <span><i className="leyenda-dot mantener" /> Sin cambio</span>
                </div>
                <div className="horario-grid-wrapper">
                  <HorarioGrid
                    entries={buildHorarioUnificado(vistaPrevia)}
                    diasSemana={DIAS_SEMANA}
                    horas={HORAS}
                    hideEmptyHours
                    obtenerColorAsignatura={() => COLOR_HORARIO.mantener}
                  />
                </div>
              </div>

              {solicitud.estado === "pendiente" && (
                <div className="review-form">
                  <textarea
                    className="observacion-input"
                    placeholder="Observación al rechazar (obligatoria)…"
                    value={observacion}
                    onChange={(e) => setObservacion(e.target.value)}
                    rows="2"
                  />
                  <div className="review-buttons">
                    <button
                      type="button"
                      className="btn-approve"
                      onClick={handleAprobar}
                      disabled={procesando}
                    >
                      {procesando ? (
                        <>
                          <FaSpinner className="spinner-small" /> Procesando…
                        </>
                      ) : (
                        <>
                          <FaCheckCircle /> Aprobar
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      className="btn-reject"
                      onClick={() => {
                        if (!observacion.trim()) {
                          alert("La observación es obligatoria al rechazar");
                          return;
                        }
                        handleRechazar();
                      }}
                      disabled={procesando || !observacion.trim()}
                    >
                      {procesando ? (
                        <>
                          <FaSpinner className="spinner-small" /> Procesando…
                        </>
                      ) : (
                        <>
                          <FaTimesCircle /> Rechazar
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default ValidarSolicitudes;