import { describe, expect, it } from 'vitest';
import { evalExpr, parse, identifiers, ExprError } from '../src/core/expr/expr';

describe('expression evaluator', () => {
  it('arithmetic and precedence', () => {
    expect(evalExpr('1 + 2 * 3', {})).toBe(7);
    expect(evalExpr('(1 + 2) * 3', {})).toBe(9);
    expect(evalExpr('2 ^ 3 ^ 2', {})).toBe(512);
    expect(evalExpr('-2 ^ 2', {})).toBe(-4);
    expect(evalExpr('10 % 4', {})).toBe(2);
    expect(evalExpr('1_000 * 2', {})).toBe(2000);
    expect(evalExpr('1e3', {})).toBe(1000);
  });
  it('identifiers and functions', () => {
    expect(evalExpr('R01 / R02', { R01: 70, R02: 5 })).toBe(14);
    expect(evalExpr('ceil(R01 / 8)', { R01: 70 })).toBe(9);
    expect(evalExpr('round(70 / 9, 1)', {})).toBe(7.8);
    expect(evalExpr('if(a > 1, 10, 20)', { a: 2 })).toBe(10);
    expect(evalExpr('min(3, 1, 2) + max(1, 5)', {})).toBe(6);
    expect(evalExpr('a >= 8 && b < 2', { a: 8, b: 1 })).toBe(1);
  });
  it('collects identifiers', () => {
    expect([...identifiers(parse('ceil(R01 / R07) + x.y'))].sort()).toEqual(['R01', 'R07', 'x.y']);
  });
  it('rejects unsafe or bad input', () => {
    expect(() => parse('constructor("x")')).toThrow(ExprError);
    expect(() => parse('1 +')).toThrow(ExprError);
    expect(() => parse('a; b')).toThrow(ExprError);
    expect(() => evalExpr('nope', {})).toThrow(ExprError);
  });
});
