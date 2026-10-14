import { test, expect } from 'claude-code/testing'

// Comprueba que el mod carga bien dentro del motor (su register no falla).
// La franja depende de datos reales de la sesion, que el motor de pruebas no tiene.
test('el mod carga sin fallar', ($, on) => {
  expect($).toBeDefined()
  expect(on).toBeDefined()
})
