# herdr-jw

Mods y layout de [Herdr](https://herdr.dev) que llevan a Herdr el concepto de *workspace como factory* de jw
(`feat/repo-refs-prototype` y `feat/workspace-factory`): un workspace es una carpeta con varios repos, un agente
y worktrees. Sin la app de Android.

## Instalar

```sh
./sync.sh push      # copia mods/ y layouts/ a ~/.config/herdr-app
```

Luego mezcla `config/keys.json` a mano en `~/.config/herdr-app/keys.json` (el script no lo toca):

- añade `"cmd-shift-n": "mod.open:factory"`, `"cmd-shift-u": "mod.open:factory-usage"` y `"cmd-shift-t": "mod.open:factory-tasks"`;
- quita los atajos `tab.*` (`cmd-t`, `cmd-1..9`, `ctrl-tab`, `f2`...) salvo `cmd-w`.

Activa el layout con `ctrl-shift-l` (o `herdr-app do layout.switch '{"name":"factory"}'`).
Para guardar cambios hechos en la config viva: `./sync.sh pull`, y commit.

## Qué hay

| Pieza | Qué hace |
|---|---|
| `layouts/factory.json` | Clon de `main`: sin la sección de agentes, con `tabs-one`. |
| `mods/tabs-one` | Clon de `tabs` sin pestañas ni `+`: un solo tab por workspace. Deja el nombre, Files, Changes y los botones de ventana. |
| `mods/factory` | `cmd-shift-n`: pide un nombre, crea `~/ws/<nombre>/`, un space con `claude` y el panel de repos al lado. El panel añade repos de GitHub (`gh repo clone` a `.part`) o carpetas (enlazadas, sin copiar), muestra estado, rama y cambios, y las ramas con su PR (mergeado, CI fallido, con toast). El manifiesto es `<carpeta>/.factory.json`. |
| `mods/worktree-wt` | Clon del mod `worktree` con la creación de jw: lee `.jw.toml` (`root`, `setup`, `copy`, `open`), la carpeta es el último segmento de la rama, valida como jw, corre `setup` antes de abrir, tarea inicial para claude, y avisa de commits sin subir al quitar. Los checkouts van a `<repo>-wt/`. |
| `mods/factory-tasks` + `skill/herdr-tasks` | `cmd-shift-t`: lista de tareas del workspace (Markdown de jw, en `~/.config/herdr-app/data/tasks/`, una por carpeta) y su bucle: al terminar el turno el agente recibe la siguiente tarea lista (`hc send`), hasta 20 vueltas o hasta que todo esté hecho o una tarea quede bloqueada. El bucle y el contador `n/m` viven en `tabs-one` (que lleva su copia de `lib.js`, `sync.sh push` la mantiene); `sync.sh push` instala el skill en `~/.claude/skills/`. |
| `mods/factory-usage` | `cmd-shift-u`: costo y tokens por proyecto y por semana, de `~/.claude/projects` (mismas reglas de conteo que `usage.rs` de jw). |

## Tarifas

El costo muestra «sin tarifa» hasta que escribas `~/.config/herdr-app/data/factory-rates.json`
(USD por millón de tokens): `{"opus": {"input": …, "cache_read": …, "output": …}}`. No hay valores por defecto.

## Diferencias con jw

- `[[env]] file = ".env"` se trata como `copy` (jw actual lo ignora).
- No se copian `ports` ni el `.jw.toml` personal de `~/.config/jw/projects/`.
- Una rama nueva parte de `HEAD`, como en jw.
- Tras un `setup`, la tarea se pasa a claude como primer argumento (Herdr solo entrega `task` si `argv` es `claude`).
- Los menús de Herdr siguen creando worktrees en `~/.herdr/worktrees`; solo los botones del panel de repos usan `<repo>-wt/`.
- Sin `agents`, `cmd-]` y `cmd-[` pueden no seguir ninguna lista (sin probar).

## Pruebas

```sh
bun mods/worktree-wt/jwtoml.test.js    # lee tus .jw.toml reales de ~/ws/sales-assist
python3 -I mods/factory-usage/test_usage.py
```

`herdr-app check mods/<nombre>` solo dibuja el estado inicial: mira siempre `herdr-app shot`.
Sin probar con clics: el selector shell/claude y el campo de tarea del diálogo, los avisos de PR mergeado y CI fallido.
Claude pregunta «¿confías en esta carpeta?» en una carpeta nueva; si pasa en cada worktree, la tarea espera a que aceptes.
