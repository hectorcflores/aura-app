# Aura: propuesta de programas de cortos

Estado: mockup para revisión del usuario. No hay aprobación para integrar el cambio a producción. El usuario pidió ver una propuesta de la opción 3 y aclarar cómo compartir el trabajo con Claude.

El archivo programas-cortos.html es autónomo, usa el estilo de app/index.html e incluye datos del snapshot del 5 de septiembre de 2026. Puede abrirse directamente en el navegador o mediante un servidor estático. El selector Antes/Propuesta compara una representación simplificada del tratamiento actual con la propuesta. El caso principal es HO00010023: Programa 3: Fronteras, Contra corriente / Somos / El sueño de las luciérnagas, 80 minutos, sede Las Artes, 17:00 del 5 de septiembre. Los títulos se separaron del campo titulo; el prototipo no acredita que su orden sea el orden de exhibición. No se inventaron sinopsis ni duración por corto. Los horarios son históricos.

La propuesta presenta composición, duración y función, y explica la ausencia de una calificación del conjunto. No debe usarse la sinopsis actual del JSON como resumen de todo el programa: puede pertenecer a un solo corto. Para otros programas sin composición estructurada, este mockup remite a Cineteca. No es una implementación productiva del parser o de la clasificación.

También existen los resultados del diagnóstico en reports/cartelera-audit-2026-09-05/diagnostico.md y los archivos de evidencia de esa carpeta. Se confirmó 89 entradas, 36 calificadas y 53 sin nota; 40 programas/recopilaciones y 13 largometrajes faltantes. Hay cuatro calificaciones IMDb recuperables y un error independiente en Agnus Dei. Consultar el informe para detalle y límites.

No se modificaron app/index.html, app/data/cartelera.json ni scripts/build_cartelera.mjs. No se realizó commit, push o despliegue.

Folder examinado: /Users/hectorcflores/Documents/projects/aura-app. Remoto origin: https://github.com/hectorcflores/aura-app.git. Rama observada: main, commit ac863b21a8639df4fe49b9958a73cb852efedfaa. Estos datos son una observación, no una garantía de que la rama remota siga igual.

Si Claude usa el mismo folder, comparte físicamente estos archivos y debe releerlos antes de editar. No trabajar simultáneamente sobre los mismos archivos ni cambiar la rama compartida mientras el otro agente esté editando. Si usa otra copia, los cambios deben guardarse en un commit y enviarse con push; Claude debe hacer fetch y actualizar o cambiar a la misma rama. Push no actualiza automáticamente otra copia ni transfiere el contexto de una conversación.

Antes de integrar: revisar git status y cambios recientes; preservar trabajo ajeno; acordar un único responsable de integrar. Para trabajo simultáneo independiente, usar ramas con carpetas separadas (worktrees) y reunir cambios después. El Action diario también escribe app/data/cartelera.json, por lo que no conviene editar ese archivo generado para implementar la propuesta.
