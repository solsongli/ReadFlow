#set page(paper: "a5", margin: 14mm)
#set text(font: "Source Han Serif SC", size: 10pt)
#set par(leading: 0.3em, justify: true)
= Mathematical paragraph continuity
The observation history $h_t = (o_(t+1-H), a_(t+1-H), dots, o_t)$ maps to an action
$a_t tilde pi_theta(dot | l, h_t)$, where $H > 1$ is the temporal horizon and the
instruction is denoted by $l$. Each observation $o_t = (v_t, p_t)$ represents visual
and proprioceptive information. These definitions belong to one continuous paragraph.

The static task is described by $(e_i, x_i, q_i, G, Phi, Psi)$, where $x_i$ is the
initial position and $q_i$ is the initial orientation. A state predicate
$phi: S times A arrow {0, 1}$ and a trajectory predicate $psi: H arrow {0, 1}$
remain inline parts of this complete explanation.

Formally, we aim to solve
#math.equation(block: true, numbering: "(1)", $pi^star = arg max_(pi_theta in Pi_C) J(pi_theta)$)
The numbered expression is independently centered and its star belongs to it.

#pagebreak()
= Two-column evidence
#columns(2, gutter: 12pt)[
  The first column describes $x_i^2 + y_i^2$ as a useful quantity and contains
  a continuous explanation with ordinary words around the mathematics.
  The symbols must not become isolated untranslated lines.

  #math.equation(block: true, numbering: "(1)", $E = m c^2$)
  The expression above remains a display equation.

  The next paragraph contains $alpha + beta = gamma$ in the middle of its explanation.
  This text should retain its mathematical spans without merging distinct paragraphs.
]
