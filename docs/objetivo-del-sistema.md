# FlowBoard: objetivo del sistema

## Propósito

FlowBoard tiene como objetivo facilitar el seguimiento de las historias de usuario (HU) gestionadas en Azure DevOps mediante una visualización rápida, clara y precisa. El sistema permitirá identificar quiénes trabajan en cada historia, conocer su estado de avance y detectar qué tareas o bloqueos requieren atención.

La propuesta consiste en conectar FlowBoard con la API de Azure DevOps para consultar la información del proyecto y actualizar el tablero automáticamente a medida que el equipo registre avances en sus historias y tareas. De esta manera, se busca reducir las consultas manuales y la necesidad de mantener reportes de seguimiento por separado.

## Necesidad que resuelve

Para comprender el estado de una historia puede ser necesario revisar su detalle, las tareas asociadas y las asignaciones de distintos integrantes del equipo. Esto dificulta obtener una visión general del sprint y reconocer rápidamente qué falta para completar una funcionalidad.

FlowBoard reunirá esa información en un mismo panel para responder preguntas concretas:

- ¿Qué historias están en curso y cuáles todavía no comenzaron?
- ¿Quién es responsable de cada historia y quién participa en sus tareas?
- ¿Cómo avanzan las actividades de frontend, backend y testing, cuando correspondan?
- ¿Qué historias están bloqueadas y qué necesitan para continuar?
- ¿Cuáles están listas para validación o para avanzar hacia producción?

## Usuarios previstos

- **Desarrolladores:** consultar sus asignaciones, reconocer dependencias y visualizar el avance de las tareas relacionadas con sus historias.
- **Equipo de QA o testing:** identificar historias disponibles para validar y conocer las actividades pendientes que impiden iniciar las pruebas.
- **Líderes de equipo y responsables del producto:** obtener una visión general del sprint, los responsables y los bloqueos para coordinar el trabajo.

## Funcionamiento esperado

1. Se configura el acceso autorizado a la organización y al proyecto de Azure DevOps.
2. FlowBoard consulta las historias del alcance seleccionado, por ejemplo, un proyecto y un sprint, junto con sus tareas relacionadas.
3. El sistema obtiene los estados, las asignaciones y los datos de avance disponibles.
4. La información se presenta en un tablero con un resumen general y el detalle de cada historia.
5. Cuando el equipo registra cambios en Azure DevOps, FlowBoard los incorpora en la siguiente sincronización y actualiza la visualización.

Azure DevOps será la fuente principal de información. La frecuencia y el mecanismo de sincronización se definirán durante la implementación. El tablero deberá indicar la última actualización y advertir cuando no sea posible obtener información reciente.

La automatización se refiere a la consulta y presentación del avance registrado: el trabajo que no se refleje en Azure DevOps no podrá deducirse automáticamente. Una futura integración con actividad de código requerirá definir sus propias reglas y relaciones con las historias.

## Información por historia de usuario

| Información                                            | Finalidad                                               |
| ------------------------------------------------------ | ------------------------------------------------------- |
| Identificador, título y descripción                    | Reconocer la historia y comprender su alcance.          |
| Proyecto y sprint                                      | Ubicarla dentro de la planificación del equipo.         |
| Responsable de la historia                             | Identificar a la persona asignada a la HU.              |
| Participantes y tareas asignadas                       | Mostrar quién trabaja en cada actividad relacionada.    |
| Estado general                                         | Conocer la etapa actual de la historia.                 |
| Avance de las tareas                                   | Comprender qué se completó y qué queda pendiente.       |
| Bloqueos y dependencias registrados                    | Detectar impedimentos para continuar.                   |
| Fecha de última sincronización y enlace a Azure DevOps | Evaluar la vigencia de los datos y consultar su origen. |

El responsable de una HU y los participantes de sus tareas pueden ser personas diferentes. El tablero deberá representar esa diferencia y mostrar explícitamente los elementos sin asignación. La separación entre frontend, backend y testing dependerá de cómo el equipo clasifique sus tareas en Azure DevOps.

## Interpretación del avance

El seguimiento combinará el estado de la historia con el de sus tareas relacionadas. Los estados visibles deberán corresponder al proceso de trabajo configurado por el equipo; los nombres utilizados en el prototipo son una referencia inicial.

Si se muestra un porcentaje, su regla de cálculo deberá ser explícita y consistente. Como propuesta inicial a validar, podría calcularse la proporción de tareas completadas sobre el total de tareas consideradas. Ese valor representaría tareas completadas, no necesariamente el esfuerzo realizado ni el tiempo restante. Si no existen datos suficientes, se mostrará que el avance no está disponible.

Completar las tareas de desarrollo no implica que una historia esté validada o publicada. La disponibilidad para testing, la aprobación de QA y la preparación para producción se reflejarán por separado, según las reglas acordadas por el equipo.

### Ejemplo de uso

Una historia requiere una tarea de frontend y otra de backend, asignadas a desarrolladores diferentes. Cuando la tarea de frontend se marca como completada en Azure DevOps, FlowBoard refleja ese cambio tras sincronizar y muestra que backend continúa pendiente.

Cuando ambas tareas finalizan, el tablero puede señalar que el desarrollo está completo y que la historia está disponible para testing, si cumple las condiciones definidas por el equipo. La validación posterior se mostrará como una etapa distinta. Así se podrá reconocer quién participa y cuál es el siguiente paso sin revisar cada tarea por separado.

## Alcance inicial propuesto

- Integración de lectura con la API de Azure DevOps.
- Consulta de historias y tareas por proyecto y sprint.
- Visualización de responsables y participantes a partir de las asignaciones registradas.
- Tablero con estados, avance y bloqueos disponibles en los datos de origen.
- Búsqueda por identificador o título y filtros por estado y persona.
- Detalle de cada historia con tareas relacionadas y acceso a su registro en Azure DevOps.
- Actualización automática con indicación de vigencia de los datos y errores de sincronización.

La creación de tareas desde plantillas configurables, con revisión y confirmación, está incluida. La edición de historias, la modificación automática de sus estados en Azure DevOps y los despliegues a producción quedan fuera de este alcance inicial. Podrán evaluarse como ampliaciones posteriores.

## Criterios de éxito

- El usuario puede identificar rápidamente el estado de una HU y las personas asignadas a sus tareas.
- Los cambios registrados en Azure DevOps se reflejan sin volver a cargarlos en FlowBoard, dentro del intervalo de sincronización acordado.
- El tablero distingue entre desarrollo completado, validación y preparación para producción.
- Los datos faltantes, las asignaciones vacías y los errores de actualización son visibles y no se presentan como avances confirmados.
- El equipo necesita menos revisiones manuales para preparar su seguimiento habitual. La mejora podrá evaluarse comparando el tiempo dedicado antes y después de adoptar el tablero.

## Estado actual y decisiones pendientes

El proyecto cuenta con una interfaz Angular y un conector Node.js para consultar Azure DevOps y crear tareas confirmadas. Cada persona ingresa el enlace de su tablero y su PAT para crear una sesión independiente. Puede seleccionar proyectos, equipos y múltiples sprints pasados, actuales o futuros. Consulta historias y tareas, calcula el porcentaje de tareas completadas y actualiza la interfaz cada 60 segundos. La publicación requiere frontend y backend bajo un origen HTTPS; las sesiones actuales residen en memoria de una sola instancia.

Queda por validar la correspondencia inicial de estados con el flujo real del equipo. La clasificación de tareas utiliza las etiquetas Frontend, Backend y Testing registradas en Azure, con responsables y avance por especialidad. La configuración y las limitaciones de esta primera integración se describen en [Conexión con Azure DevOps](conexion-azure.md).
