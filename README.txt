Galactic Campaign Command Board MVP

Current runtime model:
- `index.html` remains the main UI shell.
- Layer visibility, zoom, pan, and view mode stay clientside in browser `localStorage` under `gcb_ui_v1`.
- Campaign mutations are intended to sync through the server and database.
- The server stores campaign state in `server/data.sqlite`.
- Live updates are broadcast with Socket.IO.

Server files:
- `server/src/server.js` runs the Express + Socket.IO server.
- `server/src/db.js` creates the SQLite database and seeds default data from `index.html`.
- `server/src/stateValidation.js` enforces role-based mutation rules.

Roles:
- Without login, every client is `Viewer`.
- `Admin` can do everything.
- `Republic Navy / GAR` can only mutate GAR-owned fleet and ship data.
- `Eventleiter / KUS` can only mutate KUS-owned fleet and ship data.

Current auth notes:
- Topbar login uses `/api/auth/login`.
- Admin user management is available through the Login Manager tab.
- Default seeded login is `admin / admin` until changed by an admin.

Important behavior:
- `Export JSON` is admin-only.
- Trello import is admin-only.
- KUS shipyard remains instant.
- GAR shipyard still uses resources and build times.
- Ship/fleet gameplay state should be treated as server-owned.

Run target:
- Start the app through the Node server so Socket.IO and SQLite are active.
- Opening the HTML file directly still works as a fallback UI mode, but it will not have live server sync.
