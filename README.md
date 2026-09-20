# Flowboard

FlowBoard facilita el seguimiento de historias de usuario de Azure DevOps con responsables, estados y tareas reales. Cada persona ingresa el enlace de su tablero y su PAT en la pantalla de conexión. Un servicio Node.js consulta Azure, permite crear tareas desde plantillas con confirmación y mantiene sesiones y cachés independientes.

## Documentación del proyecto

- [Objetivo del sistema](docs/objetivo-del-sistema.md): propósito, usuarios, funcionamiento esperado y alcance inicial.
- [Estructura del frontend](docs/estructura-del-frontend.md): componentes, estado compartido y organización del código.
- [Conexión con Azure DevOps](docs/conexion-azure.md): configuración del PAT, inicio y solución de errores.

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 21.2.2.

## Development server

To start a local development server, run:

```bash
npm start
```

`npm start` inicia Angular y la API local. Abrí `http://127.0.0.1:4200/` e ingresá el enlace de tu tablero y tu PAT. Ya no se usa un PAT compartido en `.env`. Para publicar, serví el frontend y `/api` bajo un mismo origen HTTPS; ver [publicación y sesiones](docs/conexion-azure.md#publicación).

## Publicar gratis en Render

El archivo `render.yaml` configura un único Web Service Free para Angular y la API.

1. Subir los cambios a GitHub y entrar a [Render](https://dashboard.render.com).
2. Elegir **New → Blueprint**, conectar este repositorio y seleccionar la rama que contiene `render.yaml`.
3. Revisar que el servicio `flowboard` use el plan **Free** y desplegar.

Render ejecuta `npm ci --include=dev && npm run build` y `npm run start:production`.
El servidor usa automáticamente `RENDER_EXTERNAL_URL` como origen HTTPS permitido.
No configurar ningún PAT en Render: cada persona lo ingresa al conectar con Azure.
Para un dominio propio, establecer `PUBLIC_ORIGIN` con su origen HTTPS exacto.

El despliegue está listo cuando `/api/health` responde `{"status":"ok"}` y la URL principal muestra la pantalla de conexión.
El plan gratuito se suspende después de 15 minutos sin tráfico; al reiniciar se pierden las sesiones en memoria.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
