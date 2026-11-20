// Small safe expression language for derived assumptions, KPIs and gates.
// No eval, no Function constructor. Parse to an AST, then walk it.
//
// Grammar (lowest to highest precedence):
//   or      := and ( '||' and )*
//   and     := cmp ( '&&' cmp )*
//   cmp     := add ( ( '<' | '<=' | '>' | '>=' | '==' | '!=' ) add )?
//   add     := mul ( ( '+' | '-' ) mul )*
//   mul     := unary ( ( '*' | '/' | '%' ) unary )*
//   unary   := ( '-' | '+' | '!' ) unary | pow
//   pow     := atom ( '^' unary )?
//   atom    := number | identifier | identifier '(' args ')' | '(' or ')'

export type Node =
  | { k: 'num'; v: number }
  | { k: 'id'; name: string }
  | { k: 'un'; op: string; a: Node }
  | { k: 'bin'; op: string; a: Node; b: Node }
  | { k: 'call'; fn: string; args: Node[] };

export class ExprError extends Error {}

type Tok = { t: 'num'; v: number } | { t: 'id'; v: string } | { t: 'op'; v: string };

const OPS = ['<=', '>=', '==', '!=', '&&', '||', '+', '-', '*', '/', '%', '^', '(', ')', ',', '<', '>', '!'];

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9._]/.test(src[j])) j++;
      if (src[j] === 'e' || src[j] === 'E') {
        j++;
        if (src[j] === '+' || src[j] === '-') j++;
        while (j < src.length && /[0-9]/.test(src[j])) j++;
      }
      const raw = src.slice(i, j).replace(/_/g, '');
      const v = Number(raw);
      if (!Number.isFinite(v)) throw new ExprError(`Bad number "${raw}"`);
      out.push({ t: 'num', v });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_.]/.test(src[j])) j++;
      out.push({ t: 'id', v: src.slice(i, j) });
      i = j;
      continue;
    }
    const op = OPS.find((o) => src.startsWith(o, i));
    if (!op) throw new ExprError(`Unexpected character "${c}" at ${i + 1}`);
    out.push({ t: 'op', v: op });
    i += op.length;
  }
  return out;
}

export function parse(src: string): Node {
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v: string) => peek()?.t === 'op' && peek()!.v === v;
  const expectOp = (v: string) => {
    if (!isOp(v)) throw new ExprError(`Expected "${v}"`);
    p++;
  };

  const binLoop = (next: () => Node, ops: string[]): Node => {
    let a = next();
    while (peek()?.t === 'op' && ops.includes(peek()!.v as string)) {
      const op = toks[p++].v as string;
      a = { k: 'bin', op, a, b: next() };
    }
    return a;
  };
  const or = (): Node => binLoop(and, ['||']);
  const and = (): Node => binLoop(cmp, ['&&']);
  const cmp = (): Node => {
    const a = add();
    const t = peek();
    if (t?.t === 'op' && ['<', '<=', '>', '>=', '==', '!='].includes(t.v)) {
      p++;
      return { k: 'bin', op: t.v, a, b: add() };
    }
    return a;
  };
  const add = (): Node => binLoop(mul, ['+', '-']);
  const mul = (): Node => binLoop(unary, ['*', '/', '%']);
  const unary = (): Node => {
    const t = peek();
    if (t?.t === 'op' && (t.v === '-' || t.v === '+' || t.v === '!')) {
      p++;
      return { k: 'un', op: t.v, a: unary() };
    }
    return pow();
  };
  const pow = (): Node => {
    const a = atom();
    if (isOp('^')) {
      p++;
      return { k: 'bin', op: '^', a, b: unary() };
    }
    return a;
  };
  const atom = (): Node => {
    const t = toks[p++];
    if (!t) throw new ExprError('Unexpected end of expression');
    if (t.t === 'num') return { k: 'num', v: t.v };
    if (t.t === 'id') {
      if (isOp('(')) {
        p++;
        const args: Node[] = [];
        if (!isOp(')')) {
          args.push(or());
          while (isOp(',')) {
            p++;
            args.push(or());
          }
        }
        expectOp(')');
        const fn = t.v.toLowerCase();
        if (!(fn in FUNCS)) throw new ExprError(`Unknown function "${t.v}"`);
        return { k: 'call', fn, args };
      }
      return { k: 'id', name: t.v };
    }
    if (t.v === '(') {
      const e = or();
      expectOp(')');
      return e;
    }
    throw new ExprError(`Unexpected "${t.v}"`);
  };

  const node = or();
  if (p < toks.length) throw new ExprError(`Unexpected "${(toks[p] as Tok).v}"`);
  return node;
}

const FUNCS: Record<string, (args: number[]) => number> = {
  min: (a) => Math.min(...a),
  max: (a) => Math.max(...a),
  sum: (a) => a.reduce((s, x) => s + x, 0),
  avg: (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN),
  ceil: (a) => Math.ceil(a[0]),
  floor: (a) => Math.floor(a[0]),
  abs: (a) => Math.abs(a[0]),
  sqrt: (a) => Math.sqrt(a[0]),
  pow: (a) => Math.pow(a[0], a[1]),
  round: (a) => {
    const d = a[1] ?? 0;
    const f = Math.pow(10, d);
    return Math.round(a[0] * f) / f;
  },
  clamp: (a) => Math.min(Math.max(a[0], a[1]), a[2]),
  if: (a) => (a[0] ? a[1] : a[2]),
};

export const FUNCTION_NAMES = Object.keys(FUNCS);

export function identifiers(node: Node, out = new Set<string>()): Set<string> {
  switch (node.k) {
    case 'id':
      out.add(node.name);
      break;
    case 'un':
      identifiers(node.a, out);
      break;
    case 'bin':
      identifiers(node.a, out);
      identifiers(node.b, out);
      break;
    case 'call':
      node.args.forEach((a) => identifiers(a, out));
      break;
  }
  return out;
}

export type Env = (name: string) => number;

export function evaluate(node: Node, env: Env): number {
  switch (node.k) {
    case 'num':
      return node.v;
    case 'id':
      return env(node.name);
    case 'un': {
      const a = evaluate(node.a, env);
      return node.op === '-' ? -a : node.op === '!' ? (a ? 0 : 1) : a;
    }
    case 'call':
      return FUNCS[node.fn](node.args.map((a) => evaluate(a, env)));
    case 'bin': {
      const a = evaluate(node.a, env);
      if (node.op === '&&') return a ? (evaluate(node.b, env) ? 1 : 0) : 0;
      if (node.op === '||') return a ? 1 : evaluate(node.b, env) ? 1 : 0;
      const b = evaluate(node.b, env);
      switch (node.op) {
        case '+':
          return a + b;
        case '-':
          return a - b;
        case '*':
          return a * b;
        case '/':
          return a / b;
        case '%':
          return a % b;
        case '^':
          return Math.pow(a, b);
        case '<':
          return a < b ? 1 : 0;
        case '<=':
          return a <= b ? 1 : 0;
        case '>':
          return a > b ? 1 : 0;
        case '>=':
          return a >= b ? 1 : 0;
        case '==':
          return a === b ? 1 : 0;
        case '!=':
          return a !== b ? 1 : 0;
      }
      throw new ExprError(`Unknown operator ${node.op}`);
    }
  }
}

const cache = new Map<string, Node>();
export function compile(src: string): Node {
  let n = cache.get(src);
  if (!n) {
    n = parse(src);
    if (cache.size > 2000) cache.clear();
    cache.set(src, n);
  }
  return n;
}

export function evalExpr(src: string, vars: Record<string, number> | Env): number {
  const env: Env =
    typeof vars === 'function'
      ? vars
      : (name) => {
          if (!(name in vars)) throw new ExprError(`Unknown name "${name}"`);
          return vars[name];
        };
  return evaluate(compile(src), env);
}
