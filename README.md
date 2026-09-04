# Tudux — demo

App personal de calendario y tareas estilo TeuxDeux. Offline-first, con
recurrencia estilo Outlook y sync a un backend propio.

**Demo en vivo: https://roccella.github.io/tudux-demo/**

El board arranca poblado con datos inventados y todo funciona: crear, editar,
mover entre días, recurrencia, etiquetas, categorías, búsqueda y hábitos. Los
cambios quedan en el navegador, en IndexedDB. "Restablecer demo" en Opciones
vuelve al estado inicial.

Lo que el demo no hace, porque no tiene backend: sync a la nube, integración con
Google Calendar y notificaciones de Telegram.

## Este repo es generado

Solo contiene el build estático. No se edita a mano: cada deploy lo reemplaza
entero. El código fuente vive en un repo privado, y `SOURCE.txt` dice de qué
commit salió este build.
