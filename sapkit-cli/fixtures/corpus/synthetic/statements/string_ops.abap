REPORT zdemo_cov_string.

DATA gv_text TYPE string.
DATA gv_part1 TYPE string.
DATA gv_part2 TYPE string.
DATA gv_offset TYPE i.
DATA gv_xml TYPE xstring.

CONCATENATE gv_part1 gv_part2 INTO gv_text SEPARATED BY space.
SPLIT gv_text AT ',' INTO gv_part1 gv_part2.
CONDENSE gv_text.
TRANSLATE gv_text TO UPPER CASE.
REPLACE ALL OCCURRENCES OF 'a' IN gv_text WITH 'b'.
FIND 'b' IN gv_text MATCH OFFSET gv_offset.
MESSAGE 'a demo message' TYPE 'I'.
WRITE / gv_text.
SUBMIT zdemo_cov_decl AND RETURN.
CALL TRANSFORMATION id SOURCE root = gv_text RESULT XML gv_xml.
CLEAR gv_text.
