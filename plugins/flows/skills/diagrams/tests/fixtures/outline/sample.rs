pub struct Counter {
    count: u32,
}

impl Counter {
    pub fn bump(&mut self) -> u32 {
        self.count += 1;
        self.count
    }
}

pub fn start() -> Counter {
    Counter { count: 0 }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bumps() {
        assert_eq!(start().bump(), 1);
    }
}
