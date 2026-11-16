import functools


@functools.cache
def load(path):
    return path


class Store:
    @property
    def size(self):
        return 0

    def get(self, key):
        return key
