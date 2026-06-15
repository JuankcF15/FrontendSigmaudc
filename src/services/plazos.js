import api from './auth';

export const plazosService = {
  // Obtener el periodo activo junto con los plazos del programa del usuario
  async getPlazosPeriodoActivo() {
    const response = await api.get('/api/plazos/activo');
    return response.data;
  },

  // Actualizar los plazos del periodo activo
  async updatePlazos(periodoId, plazos) {
    const response = await api.put(`/api/periodos/${periodoId}/plazos`, plazos);
    return response.data;
  },
};
