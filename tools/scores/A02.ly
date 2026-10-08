\version "2.24.0"
\language "english"

% A02 -- "peaceful" score (Vieillard et al., 2007), as printed in Bresin & Friberg (2011) Fig. 1.
% Transcribed by hand from the figure. Pitches are SOUNDING pitches.

\header { title = "A02" tagline = ##f }

upper = {
  \clef treble \key e \major \time 3/4
  \tempo 4 = 52
  r8 e'8 gs'8 b'8 <gs' e''>8 <b' gs''>8 |
  <e'' b''~>2 b''8 <e'' b''>8 |
  <ds'' b''>2. ~ |
  <ds'' b''>2. |
  r8 <cs'' e'' cs'''>8 <cs'' a''>8 <a' e''>8 cs''8 a'8 |
  cs''2. \bar "|."
}

lower = {
  \clef bass \key e \major \time 3/4
  e,8 b,8 e8 gs8 b8 e'8 |
  gs'8 fs'8 e'8 b8 gs8 e8 |
  b,8 ds8 fs8 b8 cs'8 ds'8 |
  fs'8 e'8 ds'8 b8 fs8 ds8 |
  a,8 cs8 e8 a8 cs'8 e'8 |
  a'8 gs'8 fs'8 e'8 cs'8 a8 \bar "|."
}

\score {
  \new PianoStaff << \new Staff = "rh" \upper \new Staff = "lh" \lower >>
  \layout { }
  \midi { }
}
