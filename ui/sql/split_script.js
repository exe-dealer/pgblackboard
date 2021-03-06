import extract_connect_metacmd from './sql/extract_connect_metacmd.js';
import next_statement from '../sql/next_statement.js';

export default script => {

    const database_and_script = extract_connect_metacmd(script);
    if (!database_and_script) {
      return Promise.reject({
        message: 'Missed \\connect on first line.',
      });
    }
    const database = database_and_script.database;
    let tail = database_and_script.script;
    const statements = [];
    while (tail) {
      const statement = next_statement(tail);
      tail = tail.slice(statement.length);
      statements.push(statement);
    }

    const stream = sqlStream({
      statements,
      database,
      user: 'exed',
      password: 'passpass123',
      describe: true,
    })

    stream.on('messages', function (messages) {
      while (messages.length) {
        if (Array.isArray(messages[0])) {
          const lastRowIndex = messages.findIndex(it => !Array.isArray(it));
          dispatch({
            type: 'STATEMENT_ROWS',
            rows: messages.splice(0, lastRowIndex < 0 ? messages.length : lastRowIndex),
          })
        } else {
          const m = messages.shift()
          switch (m.messageType) {
            case 'description':
              dispatch({
                type: 'STATEMENT_DESCRIBE',
                description: m.payload,
              })
              break

            case 'executing':
              dispatch({
                type: 'STATEMENT_EXECUTING',
              })
              break

            case 'complete':
              dispatch({
                type: 'STATEMENT_COMPLETE',
                command_tag: m.payload,
              })
              break

            case 'error':
              dispatch({
                type: 'STATEMENT_ERROR',
                errorMessage: m.payload,
              })
              break
          }
        }
      }
    })

};
