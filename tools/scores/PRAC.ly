\version "2.24.0"
\language "english"

% PRAC -- practice piece.  NOT one of the four scores of Bresin & Friberg (2011): the paper trained its
% participants on a separate score from the same (BRAMS) battery, which is not available here, so this is
% a short original, emotionally neutral tune (major key, moderate range, stepwise).  It is only ever
% played in the optional practice trial, so none of the four stimulus scores is heard before the task.

\header { title = "PRAC" tagline = ##f }

upper = {
  \clef treble \key d \major \time 4/4
  \tempo 4 = 92
  a'4 fs'8 g'8 a'4 d''4 |
  b'4 g'8 a'8 <b' d''>4 e''4 |
  <cs'' e''>4 a'8 b'8 cs''4 a'4 |
  d''2 fs''4 r4 |
  fs'4 e'8 d'8 e'2 |
  d'1 \bar "|."
}

lower = {
  \clef bass \key d \major \time 4/4
  d4 a,4 d4 a,4 |
  g,4 d4 g,4 d4 |
  a,4 e4 a,4 e4 |
  d4 a,4 d4 a,4 |
  g,4 d4 a,4 a,,4 |
  d,1 \bar "|."
}

\score {
  \new PianoStaff << \new Staff = "rh" \upper \new Staff = "lh" \lower >>
  \layout { }
  \midi { }
}
