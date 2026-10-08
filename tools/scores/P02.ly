\version "2.24.0"
\language "english"

% P02 -- "scary" score (Vieillard et al., 2007), as printed in Bresin & Friberg (2011) Fig. 1.
% Transcribed by hand from the figure. Pitches are SOUNDING pitches.
% Key signature: four flats. Metre: 3/4 (bars 1-4), 4/4 (bars 5-7), 2/4 (bar 8).

\header { title = "P02" tagline = ##f }

upper = {
  \clef treble \key af \major \time 3/4
  \tempo 4 = 108
  % bar 1
  <f f'>8 <f f'>8 \tuplet 3/2 { <f f'>8 <f f'>8 <f f'>8 } <f f'>4 ~ |
  % bar 2
  <f f'>2. |
  % bar 3
  <f c' f'>8 <f c' f'>8 \tuplet 3/2 { <f c' f'>8 <f c' f'>8 <f c' f'>8 } <f c' f'>4 ~ |
  % bar 4  (only the middle note, C4, is tied on into bar 5)
  <f c'~ f'>2. |
  \time 4/4
  % bar 5
  <f c' f'>4 <f f'>4 \tuplet 3/2 { <f f'>8 <f f'>8 <af af'>8 } r4 |
  % bar 6
  <af f' af'>4. <bf g' bf'>8 r2 |
  % bar 7
  <f f'>4 <f f'>4 \tuplet 3/2 { <f f'>8 <f f'>8 <af af'>8 } r4 |
  \time 2/4
  % bar 8
  <bf g' bf'>4. <df' af' c''>8 \bar "|."
}

lower = {
  \clef bass \key af \major \time 3/4
  % bars 1-4
  <f,, f,>8 c,8 <f,, f,>8 df,8 <f,, f,>8 <af,, af,>8 |
  <f,, f,>8 c,8 <f,, f,>8 df,8 <f,, f,>8 c,8 |
  <f,, f,>8 c,8 <f,, f,>8 df,8 <f,, f,>8 <af,, af,>8 |
  <f,, f,>8 c,8 <f,, f,>8 df,8 <bf,,, af,, df,>8 <c,, g,, c,>8 |
  \time 4/4
  % bars 5-7
  <f,, f,>8 c,8 <f,, f,>8 df,8 <f,, f,>8 <af,, af,>8 <f,, f,>8 c,8 |
  <f,, f,>8 c,8 <f,, f,>8 df,8 <f,, f,>8 c,8 <f,, f,>8 df,8 |
  <f,, f,>8 c,8 <f,, f,>8 df,8 <f,, f,>8 <af,, af,>8 <f,, f,>8 c,8 |
  \time 2/4
  % bar 8
  <f,, f,>8 c,8 <f,, f,>8 c,8 \bar "|."
}

\score {
  \new PianoStaff << \new Staff = "rh" \upper \new Staff = "lh" \lower >>
  \layout { }
  \midi { }
}
