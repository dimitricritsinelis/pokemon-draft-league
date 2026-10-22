/** Local development only. Production uses the Supabase transaction functions. */
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
export function createSQLiteStore(filename) {
  if(filename!==':memory:')mkdirSync(dirname(filename),{recursive:true});
  const db=new DatabaseSync(filename);
  db.exec("PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS draft_state(id TEXT PRIMARY KEY, revision INTEGER NOT NULL, value TEXT NOT NULL);");
  db.prepare("INSERT OR IGNORE INTO draft_state(id,revision,value) VALUES('main',0,?)").run(JSON.stringify({leagues:{},lobbies:{}}));
  return Object.freeze({
    kind:'local-sqlite',
    async read(){const row=db.prepare("SELECT revision,value FROM draft_state WHERE id='main'").get();return{revision:row.revision,state:JSON.parse(row.value)};},
    async commit(expectedRevision,nextState){return db.prepare("UPDATE draft_state SET value=?,revision=revision+1 WHERE id='main' AND revision=?").run(JSON.stringify(nextState),expectedRevision).changes===1;},
    close(){db.close();}
  });
}
