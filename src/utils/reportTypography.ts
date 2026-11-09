/* Standalone print documents do not inherit the main application stylesheet.
   Use licensed Helvetica if locally installed, otherwise the IBM Plex fallback.
   Do not distribute proprietary font binaries in the public repository. */
export const REPORT_TYPOGRAPHY_CSS = [
  "@font-face{font-family:'Helvetica Neue LT Arabic App';src:local('HelveticaNeueLTArabic-Roman'),local('Helvetica Neue LT Arabic 55 Roman'),local('HelveticaNeueLT Arabic 55 Roman');font-weight:400;font-style:normal;font-display:swap}",
  "@font-face{font-family:'Helvetica Neue LT Arabic App';src:local('HelveticaNeueLTArabic-Bold'),local('Helvetica Neue LT Arabic 75 Bold'),local('IBMPlexSansArabic-Bold'),local('IBM Plex Sans Arabic Bold');font-weight:700;font-style:normal;font-display:swap}",
  "body,body *,button,input,select,textarea{font-family:'Helvetica Neue LT Arabic App','Helvetica Neue LT Arabic','IBM Plex Sans Arabic',Tahoma,Arial,sans-serif!important}",
  "h1,h2,h3,h4,h5,h6,th,button,b,strong{font-weight:700!important}",
].join('');