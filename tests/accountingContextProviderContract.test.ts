import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import * as ts from 'typescript';

/**
 * Guard the runtime contract: declaring a callback on AccountingContextType
 * does not expose it to consumers unless the Provider value contains it.
 * A missing createReceiptVoucherAtomic previously rendered a minified
 * "m is not a function" after clicking Save on a new receipt.
 */
const path=resolve(process.cwd(),'src/context/AccountingContext.tsx');
const source=ts.createSourceFile(path,readFileSync(path,'utf8'),
 ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);

function descendants<T extends ts.Node>(
 root:ts.Node,predicate:(node:ts.Node)=>node is T
):T[]{
 const found:T[]=[];
 const scan=(node:ts.Node)=>{
  if(predicate(node))found.push(node);
  ts.forEachChild(node,scan);
 };
 scan(root);
 return found;
}

test('AccountingProvider exposes every required AccountingContextType member',()=>{
 const iface=descendants(source,ts.isInterfaceDeclaration)
  .find(n=>n.name.text==='AccountingContextType');
 assert.ok(iface,'Missing typed AccountingContextType contract');
 const required=iface.members
  .filter((m):m is ts.PropertySignature=>ts.isPropertySignature(m)&&!m.questionToken)
  .map(m=>m.name?.getText(source));
 const provider=descendants(source,ts.isJsxOpeningElement)
  .find(n=>n.tagName.getText(source)==='AccountingContext.Provider');
 assert.ok(provider,'Missing actual AccountingContext.Provider JSX element');
 const value=provider.attributes.properties
  .find((p):p is ts.JsxAttribute=>
   ts.isJsxAttribute(p)&&p.name.text==='value');
 assert.ok(value&&value.initializer&&ts.isJsxExpression(value.initializer),
  'Provider value must be an inspectable JSX expression');
 const object=value.initializer.expression;
 assert.ok(object&&ts.isObjectLiteralExpression(object),
  'Provider value must be an object literal with explicitly bound functions');
 const offered=new Set(object.properties.flatMap(p=>
  ts.isShorthandPropertyAssignment(p)?[p.name.text]:
  ts.isPropertyAssignment(p)?[p.name.getText(source)]:[]));
 const missing=required.filter(key=>key&&!offered.has(key));
 assert.deepEqual(missing,[],'Provider omitted required runtime functions');
 assert.ok(offered.has('createReceiptVoucherAtomic'),
  'New receipt must use the PostgreSQL-atomic creation callback');
 assert.ok(offered.has('amendReceiptVoucher'),
  'Editing an existing receipt must continue to use the approved amendment callback');
});

test('atomic receipt callback has one implementation and is wired as that same function',()=>{
 const definitions=descendants(source,ts.isVariableDeclaration)
  .filter(n=>n.name.getText(source)==='createReceiptVoucherAtomic');
 assert.equal(definitions.length,1,
  'Avoid silently assigning an unresolved or duplicated receipt callback');
 const functionValue=definitions[0].initializer;
 assert.ok(functionValue&&ts.isArrowFunction(functionValue),
  'Atomic receipt callback must have a concrete implementation');
 const statements=functionValue.body.getText(source);
 assert.doesNotMatch(statements,/fetchAuthoritativeBootstrap/);
 assert.match(statements,/receipt\.changes/);
 assert.match(statements,/saved.*journal.*treasuryChanged.*partyChanged/s);
 assert.match(statements,/remote\.push/);
 assert.match(statements,/journalEntries/);
 assert.match(statements,/treasuries/);
 assert.match(statements,/parties/);
});
