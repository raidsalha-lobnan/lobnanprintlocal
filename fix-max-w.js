const fs = require('fs');
const file = 'src/components/AccountStatementModal.tsx';
let content = fs.readFileSync(file, 'utf8');
content = content.replace('print:max-h-none print:border-none', 'print:max-h-none print:max-w-none print:border-none');
fs.writeFileSync(file, content);
