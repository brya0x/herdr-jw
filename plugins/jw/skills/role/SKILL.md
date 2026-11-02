---
name: role
description: >
  Pone a esta sesión en un rol de trabajo (brain, researcher, …) leyendo su archivo de `roles/`.
  Úsalo solo cuando la persona escribe /jw:role o /jw:role <rol>: sin nombre lista los roles que
  hay; con nombre toma ese rol hasta que la persona diga que lo suelte.
disable-model-invocation: true
---

# /jw:role: tomar un rol

Los roles son archivos `<nombre>.md`. Se buscan en tres capas; si el mismo nombre está en varias,
gana la más cercana al proyecto:

1. `.claude/roles/` del proyecto (si existe).
2. `~/.claude/roles/`.
3. `roles/` junto a este skill (los que trae el plugin: `herdr-brain`, `herdr-researcher`, escritos para Herdr y con otro nombre para que los de jw en `~/.claude/roles/` no los tapen). La ruta base del skill
   te la da el sistema al cargarlo.

## Qué hacer

1. **Sin nombre** (`/jw:role` a secas): lista los roles de las tres carpetas (Glob de `*.md`; lee solo las
   primeras líneas de cada uno), en una tabla corta de nombre, capa y descripción, y pregunta cuál quiere.
   No tomes ninguno.
2. **Con nombre** (`/jw:role researcher`): lee ese archivo entero, di en **una línea** qué rol tomas y qué
   NO harás en él, y a partir de ahí sigue sus instrucciones en esta sesión. Si lo que viene después del
   nombre es una tarea (`/jw:role herdr-researcher cómo funciona la cola de mensajes`), empieza por ella.
3. **Nombre que no existe**: no adivines; di cuáles hay.
4. El rol dura **hasta que la persona lo suelte** («sal del rol», o `/jw:role` con otro nombre). Al
   cambiar, el anterior deja de aplicar.

## Reglas

- Un rol no concede permisos nuevos: lo que la persona no te ha autorizado, sigue sin estarlo.
- No resumas el archivo del rol a la persona ni lo pegues entero: úsalo.
- Responde en el idioma de la persona.
