# Calculateur de Calories intelligent

Application web front-end (stockage local uniquement) pour:

- Suivre les calories par repas (Petit-déj, Déjeuner, Dîner, Collations).
- Comparer l'apport journalier au TDEE (Harris-Benedict + activité).
- Configurer un objectif (maintien, perte, prise de masse) avec delta recommandé automatique.
- Projeter le temps estimé vers un poids cible (base 7700 kcal ≈ 1 kg).
- Consulter un calendrier coloré selon l'écart à l'objectif.
- Utiliser une base préremplie de 300 aliments courants avec recherche tolérante (ex: oeuf/œuf, boeuf/bœuf).
- Gérer plusieurs profils (une personne par profil).
- Exporter les 30/60/90 derniers jours en CSV.
- Exporter / importer une sauvegarde JSON complète (profils + historique).

## Lancer localement

Aucun serveur n'est nécessaire.

Ouvrez simplement `index.html` dans votre navigateur (double-clic).

## Données

- Données persistées dans `localStorage`.
- Sauvegarde portable via export JSON (pratique pour changer d'ordinateur ou mobile).
- Aucune authentification, aucun envoi réseau.
