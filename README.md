# Calculateur de Calories intelligent

Application web front-end (stockage local uniquement) pour:

- Suivre les calories par repas (Petit-déj, Déjeuner, Dîner, Collations).
- Comparer l'apport journalier au TDEE (Harris-Benedict + activité).
- Configurer un objectif (maintien, perte, prise de masse).
- Projeter le temps estimé vers un poids cible (base 7700 kcal ≈ 1 kg).
- Consulter un calendrier coloré selon l'écart à l'objectif.
- Utiliser une base préremplie de 300 aliments courants.
- Exporter les 30/60/90 derniers jours en CSV.

## Lancer localement

```bash
python -m http.server 8000
```

Puis ouvrir `http://localhost:8000`.

## Données

- Données persistées dans `localStorage` (`calorie-tracker-v1`).
- Aucune authentification, aucun envoi réseau.
