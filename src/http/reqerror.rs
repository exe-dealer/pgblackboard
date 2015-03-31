use std::error::Error;
use std::fmt::{Display, Formatter};

use respstatus::ResponseStatus;

#[derive(Debug)]
pub struct RequestError {
    pub status: ResponseStatus,
    pub desc: &'static str,
}

impl Error for RequestError {
    fn description(&self) -> &str { self.desc }
    fn cause(&self) -> Option<&Error> { None }
}

impl Display for RequestError {
    fn fmt(&self, f: &mut Formatter) -> ::std::fmt::Result {
        f.write_str(self.description())
    }
}
