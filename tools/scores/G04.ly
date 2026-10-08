\version "2.24.0"
\language "english"

% G04 -- "happy" score (Vieillard et al., 2007), as printed in Bresin & Friberg (2011) Fig. 1.
% Transcribed by hand from the figure. Pitches are SOUNDING pitches.

\header { title = "G04" tagline = ##f }

upper = {
  \clef treble \time 4/4
  \tempo 4 = 120
  % bar 1
  <e'' c'''>8. <e'' c'''>16 <d'' g''>8. <d'' g''>16 <c'' a''>8. <c'' a''>16 <b' d''>8. <b' d''>16 |
  % bar 2
  <b' g''>8. <a' f''>16 <g' e''>8. <f' d''>16 <f' c''>8. <d' b'>16 <e' c''>4 |
  % bar 3
  <c' g'>8. <e' g'>16 <f' a'>8. <d' b'>16 <e' c''>8. <e' c''>16 <g' e''>8. <e' c''>16 |
  % bar 4
  <fs' d''>8. <g' e''>16 <a' fs''>8. <c'' d''>16 <b' g''>2 |
  % bar 5 (= bar 1)
  <e'' c'''>8. <e'' c'''>16 <d'' g''>8. <d'' g''>16 <c'' a''>8. <c'' a''>16 <b' d''>8. <b' d''>16 |
  % bar 6
  <b' g''>8. <a' f''>16 <g' e''>8. <f' d''>16 <g' e''>8. <a' f''>16 <c'' g''>4 |
  % bar 7
  <b' g''>8. <c'' a''>16 <b' g''>8. <b' f''>16 <c'' e''>8. <g' d''>16 <e' c''>8. <e' g'>16 |
  % bar 8
  <f' a'>8. <d' c''>16 <d' b'>8. <f' d''>16 <e' c''>2 \bar "|."
}

lower = {
  \clef bass \time 4/4
  c'4 b4 a4 g4 |
  g4 g,4 g,4 c4 |
  c4 g,4 c4 g4 |
  d4 a,4 g,8. d16 g8. g16 |
  c'4 b4 a4 g4 |
  g4 g4 c4 e4 |
  d4 g,4 c4 e4 |
  d4 g,4 c4 c,4 \bar "|."
}

\score {
  \new PianoStaff << \new Staff = "rh" \upper \new Staff = "lh" \lower >>
  \layout { }
  \midi { }
}
