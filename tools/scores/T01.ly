\version "2.24.0"
\language "english"

% T01 -- "sad" score (Vieillard et al., 2007), as printed in Bresin & Friberg (2011) Fig. 1.
% Transcribed by hand from the figure. Pitches are SOUNDING pitches.
% Key signature: SEVEN flats (so e.g. the printed C4 sounds as Cb4 = B3, and F2 as Fb2 = E2).
% The one natural sign in bar 2 (G) applies to the rest of that bar.

\header { title = "T01" tagline = ##f }

upper = {
  \clef treble \key cf \major \time 3/4
  \tempo 4 = 40
  % bar 1
  r8 <ef' cf''>4 <ef' cf''>8 <df' bf'>8 <cf' af'>8 |
  % bar 2
  <cf' af'>8 <bf g'>8 <cf' g'>8 <cf' af'>8 <df' bf'>4 |
  % bar 3
  r8 <df' bf'>4 <cf' af'>4. \bar "|."
}

lower = {
  \clef bass \key cf \major \time 3/4
  af,,4 ff,4 af4 |
  ef,4 ef4 ef,4 |
  af,,4 af,4 af4 \bar "|."
}

\score {
  \new PianoStaff << \new Staff = "rh" \upper \new Staff = "lh" \lower >>
  \layout { }
  \midi { }
}
