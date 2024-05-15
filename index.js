// Number of rows per exercise on the spreadsheet
const ROWS_PER_EXERCISE = 7;
// Number of columns selected when copying from spreadsheet
const COLS_PER_ROW = 6;

/**
 * Splits an array into smaller arrays of a specified size.
 * @param {Array} arr - The array to partition.
 * @param {number} size - The size of each partition.
 * @returns {Array} An array containing partitions of the original array.
 */
function partition(arr, size) {
  const partitions = [];
  for (let i = 0; i < arr.length; i += size) {
    const partition = arr.slice(i, i + size);
    partitions.push(partition);
  }
  return partitions;
}

/**
 * Parses the 'data' parameter from the URL query string and decodes it from base64.
 * @returns {string} The decoded data.
 */
function parseRequest() {
  const params = new URLSearchParams(document.location.search);
  const data = params.get("data");
  return atob(data);
}

/**
 * Parses the raw data into rows.
 * @param {string} data - The input data to be parsed into rows.
 * @returns {string[][]} An array of rows, each containing an array of column values.
 */
function parseDataToRows(data) {
  // NOTE: We used to split by tab (\t), but casting the clipboard to Text on
  // iOS causes \t to be replaced by \n instead, making column
  // delimiters indifferentiable from row delimiters. Partitioning is
  // the easiest way to get around this for now.
  // We run .replace(/\t/g, "\n") to enforce this behaviour so that the
  // behaviour is the same on both macOS and iOS.
  const rows = partition(data.replace(/\t/g, "\n").split("\n"), COLS_PER_ROW);
  return rows.filter((row) => row.length >= COLS_PER_ROW);
}

/**
 * Parses rows of exercise data into a structured exercise object.
 * @param {Array} rows - Rows of exercise data, each containing information about sets.
 * @returns {Object} An exercise object containing parsed data.
 */
function parseRowsToExercise(rows) {
  const [titleRow, ...detailRows] = rows;

  return {
    name: titleRow[0],
    sets: detailRows.flatMap(parseDetailRow),
  };
}

/**
 * Parses a detail row of exercise data into an array of exercise set objects.
 * @param {Array} detailRow - The detail row containing information about an exercise set.
 * @returns {Array} An array of exercise set objects parsed from the detail row.
 */
function parseDetailRow(detailRow) {
  // We use the prefix _ to signify that it's a string (i.e. a raw value)
  const [_sets, _reps, _rpe, _weight, _actualWeight, _actualRPE] = detailRow;

  const numSets = parseInt(_sets);
  const numReps = parseInt(_reps);
  const rpe = parseFloat(_rpe) || null;
  const weight = parseFloat(_weight) || null;
  const actualWeight = parseFloat(_actualWeight) || null;
  const lowerActualRPE = parseFloat(_actualRPE.split("-")[0]) || 0;
  const upperActualRPE = parseFloat(_actualRPE.split("-")[1]) || lowerActualRPE;

  const sets = [];
  for (let i = 0; i < numSets; i++) {
    sets.push({
      numReps,
      rpe,
      weight,
      actualWeight,
      lowerActualRPE,
      upperActualRPE,
    });
  }
  return sets;
}

/**
 * Formats an exercise object into an array of human-readable strings.
 * @param {Object} exercise - The exercise object to format.
 * @returns {Array} An array of formatted strings representing the exercise.
 */
function formatExercise(exercise) {
  const formattedSets = exercise.sets
    .reduce((acc, set) => {
      // Initialise result if it's empty
      if (acc.length === 0) {
        acc.push([1, set]);
        return acc;
      }

      const [numSets, prevSet] = acc[acc.length - 1];
      if (
        prevSet.reps === set.reps &&
        prevSet.actualWeight === set.actualWeight
      ) {
        // Coalesce sets if they have the same working weight and reps
        acc[acc.length - 1] = [numSets + 1, coalesce(prevSet, set)];
      } else {
        acc.push([1, set]);
      }
      return acc;
    }, [])
    .map(([numSets, set]) => formatSet(set, numSets));

  const lines = [exercise.name, formattedSets.join("\n")];

  return lines.join("\n");
}

/**
 * Formats a single exercise set into a human-readable string.
 * @param {Object} set - The exercise set to format.
 * @param {number} numSets - The number of sets of the same type.
 * @returns {string} A formatted string representing the exercise set.
 */
function formatSet(set, numSets) {
  const { actualWeight, numReps, lowerActualRPE, upperActualRPE } = set;
  const formattedRPE =
    lowerActualRPE === upperActualRPE
      ? `${lowerActualRPE || "<5"}`
      : `${lowerActualRPE || "<5"}-${upperActualRPE}`;
  return `${actualWeight}kg ${numSets}x${numReps} @ ${formattedRPE}`;
}

/**
 * Coalesces two exercise sets into a single set by combining their RPE ranges.
 * @param {Object} setA - The first exercise set.
 * @param {Object} setB - The second exercise set to coalesce with the first.
 * @returns {Object} A new exercise set with the combined RPE range from the input sets.
 */
function coalesce(setA, setB) {
  return {
    ...setA,
    lowerActualRPE: Math.min(setA.lowerActualRPE, setB.lowerActualRPE),
    upperActualRPE: Math.max(setA.upperActualRPE, setB.upperActualRPE),
  };
}

/**
 * Formats workout data into a structured format suitable for display or further processing.
 * @param {string} data - The raw workout data to be formatted.
 * @returns {string} The formatted workout data.
 */
function formatWorkout(exercises) {
  const formattedExercises = exercises
    .map(formatExercise)
    .map((exerciseStr) => `${exerciseStr}\n`);
  const formattedWorkout = [yyyymmdd(), "", ...formattedExercises].join("\n");
  return postprocess(formattedWorkout);
}

/**
 * Returns the current date in "YYYY-MM-DD" format.
 * @param {Date} date - An optional date object. If not provided, the current date is used.
 * @returns {string} The current date in "YYYY-MM-DD" format.
 */
function yyyymmdd(date = null) {
  return (date ?? new Date()).toISOString().split("T")[0];
}

/**
 * Postprocesses the output.
 * (Here I apply styling by lowercasing and shortening 'competition' to 'comp').
 * @param {string} output - The output to be postprocessed.
 * @returns {string} The postprocessed output.
 */
function postprocess(output) {
  return output.toLowerCase().replace(/competition/g, "comp");
}

function main() {
  const data = parseRequest();
  const rows = parseDataToRows(data);
  const exercises = partition(rows, ROWS_PER_EXERCISE).map(parseRowsToExercise);
  const workout = formatWorkout(exercises);
  const html = workout.replace(/\n/g, "<br/>");
  document.write(html);
}

main();
