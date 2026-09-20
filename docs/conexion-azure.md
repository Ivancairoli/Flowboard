# Conexión con Azure DevOps

FlowBoard usa Angular y un servicio Node.js que consulta Azure y permite crear tareas con confirmación. Cada persona ingresa su enlace de Azure y un PAT personal; el servidor valida acceso al proyecto, equipo y sprints antes de crear la sesión. No se requiere una base de datos. Usar Node.js 22.12 o superior compatible con Angular 21.

## Conectarse

1. Ejecutar npm install si faltan dependencias, luego npm start y abrir http://127.0.0.1:4200.
2. Pegar el enlace del proyecto, tablero o sprint de https://dev.azure.com. Ejemplo: https://dev.azure.com/PagesWeb/Pages/_sprints/taskboard/Pages%20Team/Pages/Sprint%201.
3. Ingresar un PAT de esa organización con **Work Items → Read** (o **Read & write** para crear tareas) y **Project and Team → Read**, de una cuenta con acceso al proyecto.
4. Presionar **Conectar tablero**. El enlace determina organización, proyecto, equipo e iteración inicial. Si el enlace es solo del proyecto se toma el primer equipo disponible.
5. Elegir proyecto, equipo y uno o varios sprints en la barra superior. **Cerrar sesión** elimina la conexión para volver a ingresar con otro tablero o PAT.

npm start inicia Angular en 127.0.0.1:4200 y la API en 127.0.0.1:3001. Detener con Ctrl+C antes de iniciar otra instancia. Los cambios de PAT se hacen desde la pantalla, sin reiniciar. Las antiguas variables AZURE_DEVOPS_PAT, AZURE_DEVOPS_PROJECT, AZURE_DEVOPS_TEAM y AZURE_DEVOPS_ITERATION ya no se usan.

El PAT autoriza las consultas y, si tiene permisos de escritura, la creación confirmada de tareas con los permisos de su titular. Esta conexión no crea una cuenta propia de FlowBoard ni implementa un inicio de sesión Microsoft. Microsoft recomienda Entra para integraciones de producción; el modo PAT solicitado queda disponible con sesiones temporales. [Guía de autenticación de Microsoft](https://learn.microsoft.com/en-us/azure/devops/integrate/get-started/authentication/authentication-guidance?view=azure-devops).

## Sesiones

El PAT se envía una vez al backend al conectar y queda únicamente en la memoria del proceso durante la sesión. El campo se vacía al enviar; no se escribe en localStorage, sessionStorage, archivos ni cookies. El navegador recibe un identificador aleatorio con HttpOnly y SameSite=Strict; en publicación además usa Secure y el prefijo __Host-. El backend almacena el hash de ese identificador.

Cada sesión tiene cliente Azure y caché propios. Las sesiones duran hasta 8 horas, vencen después de 30 minutos sin solicitudes y se pierden al reiniciar el servidor. La sincronización de una pestaña abierta cuenta como actividad. Cerrar sesión las invalida inmediatamente; cerrar una pestaña no garantiza el cierre de la sesión del navegador. Las pestañas del mismo navegador y perfil comparten la sesión. Para conectar identidades distintas a la vez se necesitan perfiles separados.

El servidor limita intentos de conexión a 10 por minuto por dirección de conexión, consultas a 120 por minuto por sesión y sesiones simultáneas a 1000. No confía en cabeceras de IP reenviadas: detrás de un proxy el límite de intentos se comparte por su IP. Ajustar esa política antes de escalar a muchos usuarios. El servicio no registra cuerpos de solicitudes, PATs ni respuestas privadas de Azure.

## Seleccionar proyecto y varios sprints

Se listan proyectos accesibles de la organización del enlace, equipos y sprints asignados al equipo. Los sprints se agrupan en actuales, futuros, pasados y sin fechas. Se preselecciona la iteración del enlace o la actual; si ninguna está disponible, seleccionar manualmente.

Las historias se combinan sin duplicados; cada tarjeta muestra su ruta de iteración. El resumen se calcula sobre HU únicas. Al cambiar de proyecto o equipo se limpia la vista anterior y se ignoran respuestas pendientes de la selección anterior. Sin sprints seleccionados no se consulta el tablero. Se admiten hasta 50 por consulta. La selección dura hasta recargar la página y no modifica Azure. Para cambiar de organización, cerrar sesión e ingresar el nuevo enlace.

## Publicación

No alcanza con subir Angular a un hosting estático: también debe ejecutarse el backend Node.js. Esta implementación contempla una instancia del backend y un origen HTTPS común para frontend y API.

1. Ejecutar npm ci --include=dev y npm run build. En producción Node sirve dist/Flowboard/browser como sitio estático con fallback a index.html.
2. Ejecutar node server/index.mjs con NODE_ENV=production y PUBLIC_ORIGIN=https://tu-dominio.example (sin barra final). Opcionalmente definir PORT (3001 por defecto) y HOST (127.0.0.1 por defecto; usar 0.0.0.0 si el contenedor lo requiere).
3. Configurar el proxy HTTPS para enviar las solicitudes al backend, preservando Host con el dominio público y las cabeceras Origin y Cookie. No cachear /api, no registrar cuerpos ni cookies y no exponer el puerto HTTP del backend a Internet. El mismo servidor sirve Angular. El proxy debe admitir consultas de hasta 120 segundos y solicitudes POST /api/tasks de hasta 660 segundos para lotes de creación.
4. Redirigir HTTP a HTTPS en el proxy. PUBLIC_ORIGIN es obligatorio en producción y solo admite HTTPS, excepto en Render donde se obtiene automáticamente de RENDER_EXTERNAL_URL. La API rechaza otros orígenes y requiere una cabecera propia y un Origin válido para conectar o cerrar sesión.
5. Verificar con dos perfiles de navegador que cada uno consulta sus datos y que cerrar una sesión no afecta a la otra.

No se desplegó ningún servicio como parte de este cambio. Para varias réplicas o sesiones persistentes se requiere diseñar un almacén compartido protegido; el almacenamiento actual es memoria de una sola instancia. Los PATs deben tener el menor alcance y duración necesarios; si alguno quedó en archivos compartidos o en Git, revocarlo y sustituirlo. No basta con borrar el archivo actual.

## Datos y actualización

El servicio resuelve la ruta de la iteración dentro del equipo y consulta sus elementos. Recupera historias y tareas relacionadas en lotes de hasta 200 elementos. Soporta historias de tipo User Story, Product Backlog Item, Issue, Requirement y Bug, y tareas hijas directas de tipo Task. Las tareas vinculadas pueden pertenecer a otra iteración y siguen formando parte del avance de su historia. Los tipos personalizados requieren adaptar la clasificación en `server/azure.mjs`.

Las tarjetas muestran el responsable de la HU y los participantes asignados a sus tareas; no se deducen roles de frontend, backend o testing por el nombre del desarrollador. El detalle muestra cada tarea con su estado y responsable reales. Las descripciones se presentan como texto, sin ejecutar HTML de Azure.

El avance es **tareas completadas / tareas no eliminadas × 100**, usando las categorías de estado de Azure. Sin tareas se muestra “Avance no disponible”. La etapa de la HU se recalcula automáticamente a partir de sus tareas en cada sincronización.

Angular consulta cada 60 segundos mientras la aplicación está abierta. El servicio comparte consultas simultáneas y reutiliza una lectura durante 30 segundos; por eso “Actualizar” puede mostrar la misma fecha dentro de ese intervalo. Al fallar una actualización se conserva la última lectura y se indica que está desactualizada. Antes de la primera conexión no se cargan datos de ejemplo.

## Etiquetas de especialidad en las tareas

Agregar **una** etiqueta `Frontend`, `Backend` o `Testing` en cada tarea hija de la HU. FlowBoard lee `System.Tags` de cada tarea; ignora espacios y diferencias entre mayúsculas y minúsculas. Otras etiquetas, como `Urgente`, pueden coexistir pero no determinan la especialidad. Las etiquetas de la HU no se heredan y no se deduce la especialidad del título ni de la persona asignada.

Las tarjetas muestran tareas completadas/total y responsables para cada una de las tres especialidades. El detalle agrupa las tareas con su estado y responsable. Sin tareas en una especialidad se indica “Sin tareas”, no 100% completado. Las tareas sin una etiqueta reconocida o con varias especialidades se muestran en “Sin clasificar” con el motivo; permanecen incluidas en el avance global, sin contarse en varias especialidades.

Después de incorporar esta funcionalidad, reiniciar `npm start` para actualizar el conector. Los cambios posteriores de etiquetas en Azure se reflejan con la sincronización habitual, sin reiniciar.

## Crear tareas desde una historia

En el detalle, elegir **Crear tareas**. Completar la funcionalidad y las reglas de negocio comunes, seleccionar elementos por área y elegir Crear, Modificar o Eliminar para cada uno. Estas acciones describen el trabajo de la tarea: no modifican ni eliminan archivos o elementos existentes.

- Áreas iniciales: Base de datos (tabla, columna, procedimiento y migración), Backend (entidad, DTO, repositorio, servicio, endpoint y pruebas), Frontend (modelo, servicio, componente, pantalla y pruebas) y Testing (casos, validación y regresión).
- Combinaciones iniciales: Frontend, Backend, Testing y Agregar campo de punta a punta. Se pueden guardar selecciones propias, cambiar nombres/áreas/etiquetas, agregar o quitar opciones y eliminar combinaciones. Se guardan en localStorage por organización y proyecto, únicamente en este navegador; no se comparten con otros usuarios ni dispositivos.
- Base de datos usa Backend por defecto para integrarse con el cálculo de etapas. Cada tarea debe tener exactamente una especialidad Frontend, Backend o Testing.
- En la vista previa se editan títulos, descripciones, etiquetas y responsables individuales; las propuestas pueden quitarse. El responsable común es opcional: usar correo o nombre exacto reconocido por Azure. Si Azure no lo puede resolver, la tarea no se crea y se muestra el error.
- **Confirmar y crear… en Azure** es el único paso que envía las tareas. Requiere Work Items → Read & write y permisos de creación en el área. La consulta del tablero sigue funcionando con permisos de lectura.

La API vuelve a leer la historia, valida su proyecto y hereda sus valores actuales de System.AreaPath y System.IterationPath. Crea elementos Task con vínculo padre a la historia, con el estado inicial del proceso y sin copiar la etiqueta En Testing. No se saltean las reglas del proceso de Azure. Procesos que exijan otros campos pueden rechazar la creación; esos campos personalizados aún no forman parte del formulario.

Se permiten hasta 30 tareas por envío y 10 solicitudes de creación por minuto y sesión. La API exige sesión, origen permitido, JSON y confirmación explícita. Las descripciones se escapan como texto antes de enviarse al campo HTML de Azure.

### Duplicados y resultados parciales

La vista previa muestra tareas existentes y advertencias por títulos parecidos. El servidor omite títulos idénticos ignorando mayúsculas y espacios, incluyendo duplicados dentro del lote. Una tarea eliminada no bloquea una nueva propuesta con ese título.

Cada propuesta tiene un identificador que se guarda en Azure como etiqueta FlowBoard-UUID. No quitar esa etiqueta: permite reconocer una tarea ya creada aunque se renombre. El botón se bloquea durante el envío y el backend serializa las creaciones de una misma historia dentro de esta instancia.

Si hay un error, se conserva el resultado de cada tarea. **Consultar / continuar solicitud** reutiliza los mismos identificadores: recupera tareas creadas, reintenta rechazos explícitos y envía las pendientes. Una respuesta incierta (por ejemplo, conexión cortada) no se vuelve a enviar automáticamente mientras la instancia mantenga ese registro; primero se busca la tarea vinculada mediante su etiqueta. Si sigue sin confirmarse, revisar Azure antes de preparar otra propuesta. Las solicitudes enviadas se conservan en memoria al cerrar y reabrir el diálogo durante la misma carga de la página; recargar la página pierde esa memoria.

Los registros de intentos y bloqueos viven en una sola instancia, con un límite de 5000 intentos retenidos; no constituyen una garantía de ejecución única entre reinicios o múltiples réplicas. Después de reiniciar se consultan las tareas vinculadas y sus etiquetas/títulos, pero una escritura todavía no visible en Azure exige conciliación manual. Para escalar se necesita un registro persistente de operaciones y bloqueos compartidos.

Después de escribir se invalida la caché de la sesión y se actualiza el tablero; las tareas nuevas pueden modificar el porcentaje y la etapa. La creación no es transaccional: no se borran las tareas que ya se crearon si falla una posterior. Preparar / corregir tareas permite editar las rechazadas o no enviadas y excluye las ya creadas; no está disponible mientras haya resultados inciertos.

Referencia: [Crear work items en Azure DevOps](https://learn.microsoft.com/en-us/rest/api/azure/devops/wit/work-items/create?view=azure-devops-rest-7.1).

## Bugs vinculados

Cada tarjeta muestra los bugs abiertos y el total; el detalle lista su identificador, título, estado y enlace a Azure. Se incluyen elementos de tipo Bug vinculados directamente a la historia como hijos o mediante la relación Related, incluso fuera de los sprints seleccionados. Un mismo bug se cuenta una sola vez por historia. No se recorren vínculos indirectos a través de tareas ni relaciones de dependencia.

Los bugs eliminados (categoría Removed) no cuentan. Solo Completed se considera cerrado; Resolved y estados desconocidos siguen contando como abiertos. Los bugs se muestran por separado y no modifican el porcentaje de tareas ni la etapa de la historia. Los bugs que ya aparecen como elementos del sprint mantienen sus tarjetas independientes.

## Despliegue a Testing

Las tareas Frontend, Backend y Testing pueden crearse al inicio del sprint. Al completar el desarrollo, la historia queda en **Para Testing**. Cuando el despliegue esté disponible, agregar **En Testing** a una tarea que ya tenga la etiqueta **Testing**: ambas etiquetas deben coexistir. La historia pasa a **En testing** en la siguiente sincronización, incluso si esa tarea sigue en estado New.

La etiqueta se reconoce por coincidencia exacta, ignorando mayúsculas y espacios al principio y al final. No se hereda de la historia y no tiene efecto en tareas de Frontend, Backend, eliminadas o con especialidad ambigua. El detalle muestra si cada tarea de Testing tiene la señal de despliegue. Si se quita la etiqueta, la etapa se recalcula; con desarrollo completo vuelve a Para Testing mientras existan tareas pendientes. Completar todas las tareas, incluyendo Testing, sigue llevando a Finalizadas aunque la etiqueta falte.

## Correspondencia de estados

La etapa visible se calcula con las tareas hijas no eliminadas, independientemente del estado de la historia en Azure:

- **Sin comenzar:** ninguna tarea comenzó, o no hay tareas vinculadas.
- **En desarrollo:** alguna tarea comenzó o terminó y todavía hay desarrollo pendiente.
- **Para Testing:** todas las tareas de desarrollo terminaron y ninguna tarea de Testing tiene la etiqueta En Testing. No es necesario tener ambas especialidades si la historia solo requiere una.
- **En testing:** alguna tarea con especialidad Testing tiene además la etiqueta En Testing y todavía quedan tareas pendientes. El estado activo de la tarea por sí solo no confirma el despliegue. Esta etapa tiene prioridad si desarrollo y Testing se realizan en paralelo.
- **Finalizadas:** hay al menos una tarea de Testing y todas las tareas están completadas. Sin tareas de Testing, completar desarrollo deja la historia en Para Testing.

Se usan las categorías del proceso de Azure: InProgress, Resolved y Completed indican que una tarea comenzó; solo Completed indica que terminó. Las tareas sin especialidad o con varias etiquetas se consideran pendientes de desarrollo hasta completarse, para evitar anunciar disponibilidad para Testing con trabajo sin clasificar pendiente. Los estados de tarea desconocidos no se consideran iniciados ni completados.

Al reabrir tareas se recalcula la etapa con estas mismas reglas. El estado original de la historia se conserva en el detalle como referencia. Blocked/Bloqueada y el campo Microsoft.VSTS.CMMI.Blocked conservan la alerta de bloqueo sin cambiar la etapa calculada. Estas reglas actualizan la visualización de FlowBoard y no cambian el estado de la historia en Azure DevOps. La creación de tareas requiere una confirmación aparte. server/state-map.json ya no determina la etapa visible de las historias.

## Errores frecuentes

| Mensaje                                   | Acción                                                                                        |
| ----------------------------------------- | --------------------------------------------------------------------------------------------- |
| PAT faltante                              | Ingresar el PAT en la pantalla de conexión.                                                   |
| Azure rechazó el PAT                      | Revisar vencimiento y valor del token.                                                        |
| Acceso denegado                           | Revisar Work Items (Read), Project and Team (Read) y permisos de la cuenta sobre el proyecto. |
| Sprint no asignado al equipo              | Confirmar `Pages Team` y la ruta exacta de la iteración en la configuración del equipo.       |
| No se pudo conectar con el servicio local | Usar `npm start`; `ng serve` solo no inicia la API.                                           |
| Hay estados sin correspondencia           | Ajustar `server/state-map.json` y reiniciar.                                                  |

## Alcance y verificación

La API exige una sesión para consultar tableros, limita orígenes y hosts, no ofrece rutas arbitrarias hacia Azure y solo admite escritura mediante POST /api/tasks para crear tareas confirmadas; no permite editar ni eliminar elementos existentes. Los datos corresponden a los permisos del PAT de cada sesión. Las pruebas usan credenciales ficticias.

`npm run build` compila Angular. `npm test -- --watch=false` prueba la interfaz y su actualización. `npm run test:api` prueba consultas, transformación, errores y restricciones de acceso con respuestas simuladas, sin usar un PAT real. Una conexión real se confirma únicamente cuando la interfaz muestra una sincronización exitosa.

Referencias: [PAT de Azure DevOps](https://learn.microsoft.com/en-us/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate?view=azure-devops), [elementos de una iteración](https://learn.microsoft.com/en-us/rest/api/azure/devops/work/iterations/get-iteration-work-items?view=azure-devops-rest-7.1), [consulta por lotes](https://learn.microsoft.com/en-us/rest/api/azure/devops/wit/work-items/get-work-items-batch?view=azure-devops-rest-7.1).
