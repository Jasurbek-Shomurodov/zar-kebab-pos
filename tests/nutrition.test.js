import test from 'node:test'
import assert from 'node:assert/strict'
import { gramsLabel, millilitresLabel, servesLabel } from '../src/lib/nutrition.js'

test('serving size labels format grams kilograms millilitres and litres', () => {
  assert.equal(gramsLabel({ grams: 250 }, 'en'), '250 g')
  assert.equal(gramsLabel({ grams: 1520 }, 'en'), '1.52 kg')
  assert.equal(gramsLabel({ grams: 1000 }, 'en'), '1 kg')
  assert.equal(gramsLabel({ grams: 0 }, 'en'), '')
  assert.equal(millilitresLabel({ millilitres: 500 }, 'en'), '500 ml')
  assert.equal(millilitresLabel({ millilitres: 1520 }, 'en'), '1.52 L')
  assert.equal(millilitresLabel({ millilitres: 1000 }, 'en'), '1 L')
  assert.equal(millilitresLabel({ litres: 0.5 }, 'en'), '500 ml')
})

test('serves label shows how many people one portion feeds', () => {
  assert.equal(servesLabel({ serves: 2 }, 'en'), 'for 2 people')
  assert.equal(servesLabel({ serves: 1 }, 'en'), 'for 1 person')
  assert.equal(servesLabel({ serves: 4 }, 'ru'), 'на 4 чел.')
  assert.equal(servesLabel({ serves: 3 }, 'uz'), '3 kishilik')
  assert.equal(servesLabel({ serves: 0 }, 'en'), '')
  assert.equal(servesLabel({}, 'en'), '')
})
