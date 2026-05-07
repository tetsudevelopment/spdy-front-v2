<script setup lang="ts">
</script>

<template>
  <div class="auth-shell">
    <div class="auth-glow auth-glow--tl" />
    <div class="auth-glow auth-glow--br" />
    <main class="auth-content">
      <slot />
    </main>
  </div>
</template>

<style scoped>
.auth-shell {
  position: relative;
  min-height: 100vh;
  width: 100%;
  background: var(--color-bg);
  color: var(--color-text);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.auth-glow {
  position: absolute;
  width: 520px;
  height: 520px;
  border-radius: 9999px;
  background: var(--color-brand);
  filter: blur(140px);
  pointer-events: none;
  z-index: 0;
}

.auth-glow--tl {
  top: -180px;
  left: -180px;
  opacity: 0.04;
}

.auth-glow--br {
  bottom: -200px;
  right: -200px;
  opacity: 0.03;
}

.auth-content {
  position: relative;
  z-index: 1;
  width: 100%;
  display: flex;
  justify-content: center;
  padding: 32px 20px;
}
</style>
