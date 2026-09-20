# Estructura del frontend

El componente `App` compone la pantalla y mantiene el estado de búsqueda, filtros e historia seleccionada. Los componentes de presentación reciben datos y notifican las acciones del usuario mediante entradas y eventos; cada uno tiene su propio HTML, SCSS y TypeScript.

| Carpeta en `src/app/components/` | Responsabilidad                                                                                              |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `connection-form`                | Enlace y PAT, envío de conexión y limpieza del campo secreto.                                                |
| `app-header`                     | Selectores de proyecto, equipo y sprints; cierre de sesión.                                                  |
| `sidebar`                        | Barra lateral de navegación.                                                                                 |
| `page-heading`                   | Encabezado introductorio disponible para otras vistas; omitido en el tablero compacto.                       |
| `sprint-summary`                 | Indicadores de resumen del sprint.                                                                           |
| `story-board`                    | Lista de historias, estado vacío y contador de resultados.                                                   |
| `story-filters`                  | Búsqueda y selección de estado y responsable.                                                                |
| `story-card`                     | Presentación de una HU y evento para abrir su detalle.                                                       |
| `story-detail`                   | Panel de detalle, flujo de trabajo y evento de cierre.                                                       |
| `task-specialties`               | Resumen compacto de tareas y responsables de Frontend, Backend y Testing, reutilizado en tarjetas y detalle. |

Los filtros utilizan modelos bidireccionales para propagar los cambios hasta `App`. El tablero reenvía la selección de una tarjeta al componente principal, que decide qué detalle mostrar.

Los tipos compartidos se encuentran en `src/app/models/story.ts`. `src/app/services/board-store.ts` consulta la API local y mantiene historias, contexto, fecha de sincronización y errores mediante señales. El resumen y los filtros derivan de los datos reales. `server/azure.mjs` consulta Azure y transforma la respuesta; `server/state-map.json` configura las etapas. El formulario entrega el PAT una vez al servidor; luego se utiliza una cookie HttpOnly. `server/session.mjs` valida enlaces y crea sesiones aisladas en memoria. BoardStore restaura la sesión, maneja conexión, cierre y vencimiento, y limpia los datos privados al salir.

El layout principal ocupa la altura de la ventana. El tablero administra el scroll de las HU, las tarjetas ocupan las filas de su cuadrícula y el panel de detalle dispone de su propio scroll. Los estilos permanecen encapsulados en cada componente; `src/styles.scss` contiene el tema y las reglas globales.

La vista de trabajo prioriza la cantidad de historias visibles: utiliza un resumen compacto y tarjetas con título, participantes, estado y progreso. Cada etapa tiene desplazamiento vertical independiente. El título completo y los roles se pueden consultar mediante tooltips; el botón de detalle abre la información ampliada.
