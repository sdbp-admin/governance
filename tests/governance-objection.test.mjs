import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import fs from 'node:fs';
import vm from 'node:vm';
const moduleObject = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/governance-objection.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: moduleObject.exports });
const { OBJECTION_QUESTIONS, EMPTY_OBJECTION_DRAFT, objectionDraftIsComplete, formatObjectionConcern } = moduleObject.exports;
const draft = (answers, conflict = '') => ({ answers, conflict });
test('requires all four answers and an explanation for each Yes', () => {
  assert.equal(objectionDraftIsComplete(EMPTY_OBJECTION_DRAFT), false);
  for (let mask = 0; mask < 16; mask++) {
    const answers = OBJECTION_QUESTIONS.map((_, i) => ({ answer: mask & (1 << i) ? 'yes' : 'no', explanation: 'Concrete reasoning' }));
    assert.equal(objectionDraftIsComplete(draft(answers)), true);
    for (let i = 0; i < 4; i++) {
      const incomplete = answers.map((a, j) => j === i ? { ...a, answer: null } : a);
      assert.equal(objectionDraftIsComplete(draft(incomplete)), false);
      if (answers[i].answer === 'yes') {
        assert.equal(objectionDraftIsComplete(draft(answers.map((a, j) => j === i ? { ...a, explanation: '  ' } : a))), false);
      }
    }
  }
  assert.throws(() => formatObjectionConcern(EMPTY_OBJECTION_DRAFT));
});
test('all No remains a concern and preserves separate conflict grounds', () => {
  const text = formatObjectionConcern(draft(OBJECTION_QUESTIONS.map(() => ({ answer: 'no', explanation: 'Hidden draft must not be submitted' })), 'Proposal exceeds reserved statutory authority'));
  assert.match(text, /awaiting human review/);
  assert.equal((text.match(/Answer: No/g) || []).length, 4);
  assert.match(text, /reserved statutory authority/);
  assert.doesNotMatch(text, /Hidden draft/);
});
test('record contains exact questions and Yes reasoning without deciding validity', () => {
  const text = formatObjectionConcern(draft(OBJECTION_QUESTIONS.map(() => ({ answer: 'yes', explanation: '  Concrete harm\nFurther reasoning  ' }))));
  for (const question of OBJECTION_QUESTIONS) assert.ok(text.includes(question));
  assert.equal((text.match(/Answer: Yes/g) || []).length, 4);
  assert.equal((text.match(/Explanation: Concrete harm\nFurther reasoning/g) || []).length, 4);
  assert.doesNotMatch(text, /Valid Objection/);
});

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
function renderPanel(answers) {
  let stateIndex = 0;
  const states = [{ status: 'open', deadline_at: '2099-01-01T00:00:00Z' }, [], [], true, false, true];
  const panelModule = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync('components/governance-quick-consent.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(source, {
    exports: panelModule.exports,
    require: (name) => {
      if (name === 'react') return { ...React, useEffect: () => {}, useState: (initial) => [stateIndex < states.length ? states[stateIndex++] : (stateIndex++, typeof initial === 'function' ? initial() : initial), () => {}] };
      if (name === 'react/jsx-runtime') return jsxRuntime;
      if (name === '@/lib/governance-objection') return moduleObject.exports;
      if (name === '@/lib/local-draft') return { useLocalDraft: () => [draft(answers), () => {}, () => {}] };
      return { ProcessGuidance: () => null, SpatialPulsePause: () => null };
    },
  });
  return renderToStaticMarkup(React.createElement(panelModule.exports.ValidatedQuickConsentPanel, { proposal: { id: 'test', stage: 'prepared' }, people: [], currentUserId: 'person', personName: () => 'Person', onStartMeeting: async () => {}, onGoTensions: () => {} }));
}
import * as jsxRuntime from 'react/jsx-runtime';
test('form renders four Yes/No groups, hides No explanations and expands Yes', () => {
  const answers = OBJECTION_QUESTIONS.map(() => ({ answer: 'no', explanation: '' }));
  const no = renderPanel(answers);
  assert.equal((no.match(/type="radio"/g) || []).length, 8);
  assert.equal((no.match(/<fieldset/g) || []).length, 4);
  assert.doesNotMatch(no, /Explain your reasoning \(required\)/);
  const yes = renderPanel(answers.map((a, i) => i === 0 ? { answer: 'yes', explanation: '' } : a));
  assert.equal((yes.match(/Explain your reasoning \(required\)/g) || []).length, 1);
  assert.match(yes, /disabled="">Submit concern for review/);
  assert.doesNotMatch(no, /disabled="">Submit concern for review/);
});
