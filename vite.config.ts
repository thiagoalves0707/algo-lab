import { defineConfig } from 'vite';

// `base: './'` gera caminhos relativos, então o build funciona tanto em
// https://usuario.github.io/algo-lab/ quanto em qualquer outro host.
export default defineConfig({
  base: './',
});
