import React, { useState, useEffect, useCallback } from "react";
import { matriculaService } from "../../services/matricula";
import HorarioGrid from "../../components/common/HorarioGrid";
import "../../styles/ValidarSolicitudes.css";
import {
  FaCheckCircle,
  FaTimesCircle,
  FaSpinner,
  FaClipboardList,
  FaClock,
} from "react-icons/fa";

const DIAS_SEMANA = ["LUNES", "MARTES", "MIERCOLES", "JUEVES", "VIERNES", "SABADO"];
const HORAS = Array.from({ length: 14 }, (_, i) => 7 + i);

const COLOR_HORARIO = {
  agregar: "#34c759",
  retirar: "#ff3b30",
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

const normalizarHorarios = (horarios) =>
  (horarios || []).map((h) => ({
    ...h,
    dia: (h.dia || "").trim().toUpperCase(),
    hora_inicio: String(h.hora_inicio || "").slice(0, 8),
    hora_fin: String(h.hora_fin || "").slice(0, 8),
  }));

const materiaToEntry = (m) => ({
  asignatura: m.nombre || m.asignatura_nombre || m.codigo || m.asignatura_codigo,
  codigo: m.codigo || m.asignatura_codigo,
  grupoCodigo: m.grupo_codigo || m.grupoCodigo,
  docente: m.docente,
  horarios: normalizarHorarios(m.horarios),
});

const grupoSolicitudToEntry = (g) =>
  materiaToEntry({
    nombre: g.asignatura_nombre,
    codigo: g.asignatura_codigo,
    grupo_codigo: g.grupo_codigo,
    horarios: g.horarios,
  });

const esVistaHistorial = (vistaPrevia) =>
  Boolean(vistaPrevia?.es_historial || (vistaPrevia?.estado && vistaPrevia.estado !== "pendiente"));

const buildHorarioSolicitado = (vistaPrevia) => {
  const retirarIds = new Set((vistaPrevia.materias_retiradas || []).map((m) => m.grupo_id));
  const entries = [];

  (vistaPrevia.matricula_actual || []).forEach((m) => {
    if (retirarIds.has(m.grupo_id)) {
      entries.push({ ...materiaToEntry(m), cambio: "retirar", color: COLOR_HORARIO.retirar });
    }
  });

  (vistaPrevia.matricula_actual || []).forEach((m) => {
    if (!retirarIds.has(m.grupo_id)) {
      entries.push({ ...materiaToEntry(m), cambio: "mantener" });
    }
  });

  (vistaPrevia.materias_agregar || []).forEach((m) => {
    entries.push({
      ...grupoSolicitudToEntry(m),
      cambio: "agregar",
      color: COLOR_HORARIO.agregar,
    });
  });

  return entries;
};

const buildHorarioHistorial = (vistaPrevia) => {
  if (vistaPrevia.estado === "rechazada") {
    return buildHorarioSolicitado(vistaPrevia);
  }

  const agregarIds = new Set((vistaPrevia.materias_agregar || []).map((g) => g.grupo_id));
  const matriculaIds = new Set((vistaPrevia.matricula_actual || []).map((m) => m.grupo_id));
  const entries = [];

  (vistaPrevia.materias_retiradas || []).forEach((m) => {
    entries.push({
      ...grupoSolicitudToEntry(m),
      cambio: "retirar",
      color: COLOR_HORARIO.retirar,
    });
  });

  (vistaPrevia.matricula_actual || []).forEach((m) => {
    const fueAgregada = agregarIds.has(m.grupo_id);
    entries.push({
      ...materiaToEntry(m),
      cambio: fueAgregada ? "agregar" : "mantener",
      ...(fueAgregada ? { color: COLOR_HORARIO.agregar } : {}),
    });
  });

  (vistaPrevia.materias_agregar || []).forEach((m) => {
    if (!matriculaIds.has(m.grupo_id)) {
      entries.push({
        ...grupoSolicitudToEntry(m),
        cambio: "agregar",
        color: COLOR_HORARIO.agregar,
      });
    }
  });

  return entries;
};

const buildHorarioUnificado = (vistaPrevia) => {
  if (!vistaPrevia) return [];
  if (esVistaHistorial(vistaPrevia)) {
    return buildHorarioHistorial(vistaPrevia);
  }
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
      ...(agregar ? { color: COLOR_HORARIO.agregar } : {}),
    });
  });

  return entries;
};

const etiquetaMateria = (g) => {
  const nombre = (g.asignatura_nombre || g.nombre || "").trim();
  const codigo = (g.asignatura_codigo || g.codigo || "").trim();
  if (nombre && codigo && nombre.toLowerCase() !== codigo.toLowerCase()) {
    return `${nombre} (${codigo})`;
  }
  return nombre || codigo || "Asignatura";
};

const formatFecha = (fecha) => {
  if (!fecha) return null;
  return new Date(fecha).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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
              Una solicitud, un horario. Verde agrega, rojo retira.
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
          {solicitudesFiltradas.map((sol) => (
            <SolicitudCard
              key={sol.id}
              solicitud={sol}
              onValidar={handleValidar}
              procesando={procesando[sol.id] || false}
            />
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
    setVistaPrevia(null);
    setErrorPreview(null);
    setObservacion("");
  }, [solicitud.id, solicitud.estado]);

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
  const est = vistaPrevia?.estudiante;
  const nombreEst =
    est?.nombre && est?.apellido
      ? `${est.nombre} ${est.apellido}`
      : [solicitud.estudiante_nombre, solicitud.estudiante_apellido].filter(Boolean).join(" ") || "Estudiante";
  const codigoEst = est?.codigo || solicitud.estudiante_codigo || `ID ${solicitud.estudiante_id}`;
  const esHistorial = solicitud.estado !== "pendiente" || vistaPrevia?.es_historial;
  const fechaRevision = vistaPrevia?.fecha_revision || solicitud.fecha_revision;
  const observacionHistorial = vistaPrevia?.observacion || solicitud.observacion;

  return (
    <article className={`solicitud-card ${solicitud.estado}`}>
      <header className="solicitud-header">
        <div className="solicitud-header-main">
          <h3 className="solicitud-estudiante">{nombreEst}</h3>
          <p className="solicitud-codigo">{codigoEst}</p>
          <time className="solicitud-fecha">
            {new Date(solicitud.fecha_solicitud).toLocaleDateString("es-ES", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </time>
        </div>
        {getEstadoBadge()}
      </header>

      {solicitud.estado === "rechazada" && observacionHistorial && !mostrarRevision && (
        <p className="observacion-box">{observacionHistorial}</p>
      )}

      {!mostrarRevision && (
        <footer className="solicitud-footer">
          <button type="button" className="btn-review" onClick={toggleRevision} disabled={procesando}>
            {solicitud.estado === "pendiente" ? "Revisar solicitud" : "Ver historial"}
          </button>
        </footer>
      )}

      {mostrarRevision && (
        <div className="review-panel">
          {cargandoPreview && (
            <p className="preview-loading">
              <FaSpinner className="spinner-small" /> Cargando…
            </p>
          )}

          {errorPreview && (
            <div className="preview-alerta">
              <p>{typeof errorPreview === "string" ? errorPreview : "Error al cargar"}</p>
              <button type="button" className="btn-link" onClick={cargarVistaPrevia}>
                Reintentar
              </button>
            </div>
          )}

          {vistaPrevia && !cargandoPreview && (
            <>
              {esHistorial && (
                <p className="historial-resumen">
                  {solicitud.estado === "aprobada"
                    ? `Aprobada${fechaRevision ? ` el ${formatFecha(fechaRevision)}` : ""}.`
                    : `Rechazada${fechaRevision ? ` el ${formatFecha(fechaRevision)}` : ""}. Los cambios no se aplicaron.`}
                </p>
              )}

              <section className="estudiante-panel" aria-label="Información del estudiante">
                <dl className="estudiante-datos">
                  <div>
                    <dt>Semestre</dt>
                    <dd>{est?.semestre ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>Periodo</dt>
                    <dd>
                      {vistaPrevia.periodo
                        ? `${vistaPrevia.periodo.year}-${vistaPrevia.periodo.semestre}`
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt>{esHistorial ? "Créditos actuales" : "Créditos"}</dt>
                    <dd>
                      {creditos
                        ? esHistorial
                          ? `${creditos.inscritos_actual}`
                          : `${creditos.inscritos_actual} → ${creditos.inscritos_proyectado}`
                        : "—"}
                    </dd>
                  </div>
                  {est?.promedio != null && (
                    <div>
                      <dt>Promedio</dt>
                      <dd>{Number(est.promedio).toFixed(2)}</dd>
                    </div>
                  )}
                </dl>
              </section>

              {(() => {
                const itemsAgregar = vistaPrevia.materias_agregar?.length
                  ? vistaPrevia.materias_agregar
                  : gruposAAgregar;
                const itemsRetirar = vistaPrevia.materias_retiradas?.length
                  ? vistaPrevia.materias_retiradas
                  : gruposARetirar;
                if (itemsAgregar.length === 0 && itemsRetirar.length === 0) return null;
                return (
                  <section
                    className="cambios-panel"
                    aria-label={esHistorial ? "Historial de cambios" : "Cambios solicitados"}
                  >
                    {esHistorial && (
                      <p className="cambios-panel-titulo">
                        {solicitud.estado === "aprobada" ? "Cambios realizados" : "Cambios solicitados"}
                      </p>
                    )}
                    {itemsAgregar.map((g, i) => (
                      <p key={`a-${i}`} className="cambio-texto agregar">
                        + {etiquetaMateria(g)}
                        {g.grupo_codigo ? ` · ${g.grupo_codigo}` : ""}
                      </p>
                    ))}
                    {itemsRetirar.map((g, i) => (
                      <p key={`r-${i}`} className="cambio-texto retirar">
                        − {etiquetaMateria(g)}
                        {g.grupo_codigo ? ` · ${g.grupo_codigo}` : ""}
                      </p>
                    ))}
                  </section>
                );
              })()}

              {esHistorial && solicitud.estado === "rechazada" && observacionHistorial && (
                <p className="observacion-box">{observacionHistorial}</p>
              )}

              <section
                className="horario-panel"
                aria-label={esHistorial ? "Horario resultante" : "Horario con cambios"}
              >
                <div className="horario-grid-wrapper">
                  <HorarioGrid
                    entries={buildHorarioUnificado(vistaPrevia)}
                    diasSemana={DIAS_SEMANA}
                    horas={HORAS}
                    hideEmptyHours
                    obtenerColorAsignatura={() => "transparent"}
                  />
                </div>
              </section>

              {solicitud.estado === "pendiente" && (
                <footer className="review-form">
                  <textarea
                    className="observacion-input"
                    placeholder="Motivo del rechazo…"
                    value={observacion}
                    onChange={(e) => setObservacion(e.target.value)}
                    rows="2"
                  />
                  <div className="review-buttons">
                    <button type="button" className="btn-approve" onClick={handleAprobar} disabled={procesando}>
                      {procesando ? <FaSpinner className="spinner-small" /> : <FaCheckCircle />}
                      Aprobar
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
                      {procesando ? <FaSpinner className="spinner-small" /> : <FaTimesCircle />}
                      Rechazar
                    </button>
                  </div>
                </footer>
              )}

              <button type="button" className="btn-cerrar" onClick={toggleRevision}>
                Cerrar
              </button>
            </>
          )}
        </div>
      )}
    </article>
  );
};

export default ValidarSolicitudes;