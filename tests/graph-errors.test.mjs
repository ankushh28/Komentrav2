import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GRAPH_ERROR_CLASSIFICATIONS,
  classifyGraphError,
  shouldPauseAccountForGraphError,
} from '../lib/graph-errors.js';

test('classifies expired token errors as token_or_permission', () => {
  const error = {
    graph: {
      message: 'Error validating access token: Session has expired',
      type: 'OAuthException',
      code: 190,
      error_subcode: 463,
    },
  };

  assert.equal(classifyGraphError(error), GRAPH_ERROR_CLASSIFICATIONS.TOKEN_OR_PERMISSION);
  assert.equal(shouldPauseAccountForGraphError(error), true);
});

test('classifies permission and capability errors as token_or_permission', () => {
  for (const code of [10, 200]) {
    const error = {
      graph: {
        message: 'Application does not have permission for this action',
        type: 'OAuthException',
        code,
      },
    };

    assert.equal(classifyGraphError(error), GRAPH_ERROR_CLASSIFICATIONS.TOKEN_OR_PERMISSION);
    assert.equal(shouldPauseAccountForGraphError(error), true);
  }
});

test('classifies rate and platform limits as rate_or_platform_block', () => {
  for (const code of [4, 17, 32, 613]) {
    const error = {
      graph: {
        message: 'Application request limit reached',
        type: 'OAuthException',
        code,
      },
    };

    assert.equal(classifyGraphError(error), GRAPH_ERROR_CLASSIFICATIONS.RATE_OR_PLATFORM_BLOCK);
    assert.equal(shouldPauseAccountForGraphError(error), true);
  }
});

test('classifies unsupported object errors as object_unavailable without account pause', () => {
  const error = {
    graph: {
      message: "Unsupported post request. Object with ID '17940951342207506' does not exist, cannot be loaded due to missing permissions, or does not support this operation",
      type: 'GraphMethodException',
      code: 100,
      error_subcode: 33,
      fbtrace_id: 'abc',
    },
  };

  assert.equal(classifyGraphError(error), GRAPH_ERROR_CLASSIFICATIONS.OBJECT_UNAVAILABLE);
  assert.equal(shouldPauseAccountForGraphError(error), false);
});

test('classifies unrecognized graph errors as unknown without account pause', () => {
  const error = {
    graph: {
      message: 'Unexpected Graph API failure',
      type: 'IGApiException',
      code: 999,
    },
  };

  assert.equal(classifyGraphError(error), GRAPH_ERROR_CLASSIFICATIONS.UNKNOWN);
  assert.equal(shouldPauseAccountForGraphError(error), false);
});
