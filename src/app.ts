if (new URLSearchParams(window.location.search).get('benchmark') === '1') {
  void import('./benchmark-page')
} else {
  void import('./main')
}
